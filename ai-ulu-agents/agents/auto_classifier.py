import json
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory


class AutoClassifier(BaseAgent):
    def __init__(self, memory: Optional[AgentMemory] = None):
        super().__init__(name="AutoClassifier", memory=memory)
        self.repos_path = os.path.join("war-room", "data", "repos.json")
        self.policy_path = os.path.join("war-room", "data", "policy.json")
        self.queue_path = os.path.join("war-room", "data", "classify_queue.json")

    def _read_json(self, path: str, default: Dict[str, Any]) -> Dict[str, Any]:
        if not os.path.exists(path):
            return default
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return default

    def _write_json(self, path: str, data: Dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _suggest_class(self, repo: Dict[str, Any]) -> str:
        aura = float(repo.get("aura", 0))
        health = (repo.get("health") or "").lower()
        updated_at = repo.get("updated_at")
        if updated_at:
            try:
                last = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                if datetime.utcnow() - last.replace(tzinfo=None) > timedelta(days=180):
                    return "archive"
            except ValueError:
                pass
        if aura >= 90 and health in {"excellent", "good"}:
            return "unicorn"
        if aura < 60 and health == "poor":
            return "archive"
        return "muscle"

    def scan_and_propose(self) -> int:
        repos = self._read_json(self.repos_path, {}).get("repositories", [])
        policy = self._read_json(self.policy_path, {})
        queue = self._read_json(self.queue_path, {"pending": [], "approved": [], "rejected": []})
        pending = queue.get("pending", [])

        proposals = 0
        policy_repos = policy.get("repositories", {})
        pending_keys = {(p.get("repo"), p.get("suggested_class")) for p in pending}

        for repo in repos:
            name = repo.get("name")
            if not name:
                continue
            full = f"ai-ulu/{name}" if "/" not in name else name
            current = policy_repos.get(full, {}).get("class", "muscle")
            suggested = self._suggest_class(repo)
            if suggested == current:
                continue
            key = (full, suggested)
            if key in pending_keys:
                continue
            pending.append(
                {
                    "repo": full,
                    "current_class": current,
                    "suggested_class": suggested,
                    "reason": f"aura={repo.get('aura')} health={repo.get('health')}",
                    "created_at": datetime.utcnow().isoformat() + "Z",
                }
            )
            proposals += 1

        if proposals:
            queue["pending"] = pending
            self._write_json(self.queue_path, queue)
            self.log_activity(f"Proposed {proposals} repo classifications", icon="[CLASSIFY]")
        return proposals
