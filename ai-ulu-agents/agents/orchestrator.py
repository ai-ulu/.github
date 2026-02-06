import time
from datetime import datetime
from typing import Optional, Dict, Any

import json
import os

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory
from .core.task_queue import TaskQueue
from .core.registry import AgentRegistry
from .core.cortex import CortexFilter
from .repair_agent import RepairAgent
from .self_healing_agent import SelfHealingAgent
from .chaos_monkey import ChaosMonkey
from .watcher import Watcher
from .auto_classifier import AutoClassifier


class Orchestrator(BaseAgent):
    def __init__(
        self,
        memory: Optional[AgentMemory] = None,
        queue: Optional[TaskQueue] = None,
        poll_seconds: int = 10,
    ):
        super().__init__(name="Orchestrator", memory=memory)
        self.queue = queue or TaskQueue()
        self.registry = AgentRegistry()
        self.cortex = CortexFilter()
        self.poll_seconds = poll_seconds

    def _is_allowed(self, target: str) -> bool:
        allowlist_path = os.path.join("war-room", "data", "allowlist.json")
        if not os.path.exists(allowlist_path):
            return True
        try:
            with open(allowlist_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError):
            return False
        allowed = data.get("repos", [])
        if not allowed:
            return True
        for rule in allowed:
            rule = rule.strip()
            if not rule:
                continue
            if rule.endswith("*"):
                prefix = rule[:-1]
                if target.startswith(prefix):
                    return True
            if rule.startswith("*") and target.endswith(rule[1:]):
                return True
            if target == rule:
                return True
        return False

    def _load_policy(self) -> Dict[str, Any]:
        policy_path = os.path.join("war-room", "data", "policy.json")
        if not os.path.exists(policy_path):
            return {}
        try:
            with open(policy_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return {}

    def _policy_for_repo(self, policy: Dict[str, Any], target: str) -> Dict[str, Any]:
        repos = policy.get("repositories", {})
        if target in repos:
            return repos[target]
        # Try by repo name if target looks like org/repo
        if "/" in target:
            _, name = target.split("/", 1)
            for key, value in repos.items():
                if key.endswith(f"/{name}"):
                    return value
        return {"class": "muscle", "priority_weight": 1.0, "allowed_agents": [], "chaos_allowed": True}

    def _is_agent_allowed(self, policy: Dict[str, Any], target: str, task_type: str) -> bool:
        repo_policy = self._policy_for_repo(policy, target)
        allowed = [a.upper() for a in repo_policy.get("allowed_agents", [])]
        if not allowed:
            return True
        return task_type.upper() in allowed

    def _score_task(self, task: Dict[str, Any], policy: Dict[str, Any], rsi: float) -> int:
        priority = (task.get("priority") or "normal").lower()
        impact = (task.get("impact") or "normal").lower()
        task_type = (task.get("type") or "").upper()
        target = task.get("target", "unknown")
        repo_policy = self._policy_for_repo(policy, target)
        category = (repo_policy.get("class") or task.get("category") or "muscle").lower()
        weight = float(repo_policy.get("priority_weight", 1.0))

        score = 0
        score += 100 if priority == "high" else 10 if priority == "normal" else 1
        score += 50 if impact == "high" else 10 if impact == "normal" else 1
        if policy.get("prioritize_unicorn", False) and category == "unicorn":
            score += 100

        if policy.get("defer_chaos_when_rsi_low", False) and task_type == "CHAOS":
            threshold = float(policy.get("global_thresholds", {}).get("rsi_pause_chaos_below", 95))
            if rsi < threshold:
                score -= 200
        if repo_policy.get("chaos_allowed") is False and task_type == "CHAOS":
            score -= 500
        return int(score * weight)

    def _pick_next_task(self, policy: Dict[str, Any], rsi: float) -> Dict[str, Any]:
        data = self.queue.snapshot()
        pending = data.get("pending", [])
        if not pending:
            return {}
        scored = [(self._score_task(t, policy, rsi), t) for t in pending]
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]

    def dispatch(self, task):
        task_type = (task.get("type") or "").upper()
        task_id = task.get("id", "")
        target = task.get("target", "unknown")
        agent_cfg = self.registry.get_agent_config_for_task(task_type)
        agent_id = agent_cfg.get("agent_id", "unknown")
        base_cooldown = int(agent_cfg.get("cooldown_seconds", 0))
        cooldown = self.memory.get_backoff_seconds(agent_id, base_cooldown)
        if not self.memory.can_run(agent_id, cooldown):
            self.log_activity(
                f"Cooldown active for {agent_id} ({cooldown}s)",
                icon="[WAIT]",
                task_id=task_id,
            )
            return "cooldown"
        if task_type == "REPAIR":
            if not self._is_allowed(target):
                self.log_activity(f"Blocked by allowlist: {target}", icon="[BLOCK]", task_id=task_id)
                self.memory.record_agent_result(agent_id, False)
                return "blocked"
            agent = RepairAgent(memory=self.memory)
            agent.report_dependency_issue(target, "queued repair")
            self.log_activity(f"Dispatched repair to {target}", icon="[REPAIR]", task_id=task_id)
            self.memory.record_agent_result(agent_id, True)
            return "repair_dispatched"
        if task_type == "CHAOS":
            agent = ChaosMonkey(memory=self.memory, queue=self.queue)
            scenario = task.get("scenario", "dependency_corruption")
            agent.log_activity(f"Chaos run simulated: {scenario} on {target}", icon="[CHAOS]", task_id=task_id)
            self.memory.record_agent_result(agent_id, True)
            return "chaos_simulated"
        if task_type == "WATCH":
            agent = Watcher(memory=self.memory, queue=self.queue)
            package = task.get("package", "unknown")
            note = task.get("note", "update check")
            agent.log_activity(f"Watcher flagged {package} for {target}: {note}", icon="[WATCH]", task_id=task_id)
            repo_policy = self._policy_for_repo(self._load_policy(), target)
            category = repo_policy.get("class", "muscle")
            # Optional: turn watch event into repair task for repo
            self.queue.enqueue(
                {
                    "type": "REPAIR",
                    "target": target,
                    "priority": "normal",
                    "impact": "normal",
                    "category": category,
                }
            )
            self.memory.record_agent_result(agent_id, True)
            return "watch_dispatched"
        if task_type == "CLASSIFY":
            agent = AutoClassifier(memory=self.memory)
            proposals = agent.scan_and_propose()
            self.log_activity(f"Auto-classifier proposed {proposals} changes", icon="[CLASSIFY]", task_id=task_id)
            self.memory.record_agent_result(agent_id, True)
            return "classify_dispatched"
        if task_type == "SELF_HEAL":
            agent = SelfHealingAgent(memory=self.memory)
            metrics = self.memory.get_sync_metrics()
            if not metrics.get("panic_status"):
                self.log_activity("Self-heal skipped (no panic)", icon="[HEAL]", task_id=task_id)
                self.memory.record_agent_result(agent_id, True)
                return "self_heal_skipped"
            agent.check_system_health()
            self.log_activity("Dispatched self-heal", icon="[HEAL]", task_id=task_id)
            self.memory.record_agent_result(agent_id, True)
            return "self_heal_dispatched"
        self.log_activity(f"Unknown task type: {task_type}", icon="[WARN]")
        self.memory.record_agent_result(agent_id, False)
        return "unknown_task"

    def run_once(self) -> None:
        policy = self._load_policy()
        metrics = self.memory.get_sync_metrics()
        rsi = float(metrics.get("rsi", 0.0))
        if metrics.get("panic_status") and not self.queue.has_task("SELF_HEAL"):
            self.queue.enqueue(
                {
                    "type": "SELF_HEAL",
                    "target": "system",
                    "priority": "high",
                    "impact": "high",
                    "category": "unicorn",
                }
            )
        if policy.get("allow_idle_muscle_tasks", False):
            snapshot = self.queue.snapshot()
            if not snapshot.get("pending"):
                for task in policy.get("idle_tasks", []):
                    self.queue.enqueue(task)
        if policy.get("auto_classify", False) and not self.queue.has_task("CLASSIFY"):
            self.queue.enqueue(
                {
                    "type": "CLASSIFY",
                    "target": "policy",
                    "priority": "low",
                    "impact": "low",
                    "category": "muscle",
                }
            )
        task = self._pick_next_task(policy, rsi)
        if task:
            task = self.queue.pop_by_id(task.get("id", ""))
        else:
            task = {}
        if not task:
            return
        task_type = (task.get("type") or "").upper()
        target = task.get("target", "unknown")
        repo_policy = self._policy_for_repo(policy, target)
        if not self._is_agent_allowed(policy, target, task_type):
            self.log_activity(f"Policy blocked {task_type} on {target}", icon="[BLOCK]", task_id=task.get("id", ""))
            self.queue.complete(task, "blocked_by_policy")
            return
        if task_type == "CHAOS" and repo_policy.get("chaos_allowed") is False:
            self.log_activity(f"Chaos disabled by policy for {target}", icon="[BLOCK]", task_id=task.get("id", ""))
            self.queue.complete(task, "blocked_by_policy")
            return
        cortex_entry = self.cortex.evaluate(task, metrics)
        self.log_activity(
            f"Cortex score {cortex_entry['score']} for {task_type} on {target}",
            icon="[CORTEX]",
            task_id=task.get("id", ""),
        )
        if repo_policy.get("class") == "archive":
            self.log_activity(f"Archive repo flagged for migration: {target}", icon="[ARCHIVE]", task_id=task.get("id", ""))
        result = self.dispatch(task)
        self.queue.complete(task, result)

    def run_forever(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.poll_seconds)


if __name__ == "__main__":
    Orchestrator().run_forever()
