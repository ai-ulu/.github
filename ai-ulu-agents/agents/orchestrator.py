import time
from typing import Optional

import json
import os

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory
from .core.task_queue import TaskQueue
from .core.registry import AgentRegistry
from .repair_agent import RepairAgent
from .self_healing_agent import SelfHealingAgent
from .chaos_monkey import ChaosMonkey
from .watcher import Watcher


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
            # Optional: turn watch event into repair task for repo
            self.queue.enqueue({"type": "REPAIR", "target": target, "priority": "normal"})
            self.memory.record_agent_result(agent_id, True)
            return "watch_dispatched"
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
        metrics = self.memory.get_sync_metrics()
        if metrics.get("panic_status") and not self.queue.has_task("SELF_HEAL"):
            self.queue.enqueue(
                {
                    "type": "SELF_HEAL",
                    "target": "system",
                    "priority": "high",
                }
            )
        task = self.queue.dequeue()
        if not task:
            return
        result = self.dispatch(task)
        self.queue.complete(task, result)

    def run_forever(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.poll_seconds)


if __name__ == "__main__":
    Orchestrator().run_forever()
