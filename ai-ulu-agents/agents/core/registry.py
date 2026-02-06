import json
import os
from typing import Dict, Any


class AgentRegistry:
    def __init__(self, registry_path: str = "war-room/data/agent_registry.json"):
        self.registry_path = registry_path
        self._ensure_registry()

    def _ensure_registry(self) -> None:
        if not os.path.exists(self.registry_path):
            os.makedirs(os.path.dirname(self.registry_path), exist_ok=True)
            default = {
                "agents": {
                    "repair_agent": {"cooldown_seconds": 10, "capabilities": ["REPAIR"]},
                    "self_healing_agent": {
                        "cooldown_seconds": 5,
                        "capabilities": ["SELF_HEAL"],
                    },
                }
            }
            with open(self.registry_path, "w", encoding="utf-8") as f:
                json.dump(default, f, indent=2)

    def _read(self) -> Dict[str, Any]:
        with open(self.registry_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_agent_config_for_task(self, task_type: str) -> Dict[str, Any]:
        task_type = (task_type or "").upper()
        data = self._read()
        agents = data.get("agents", {})
        for agent_id, cfg in agents.items():
            if task_type in [c.upper() for c in cfg.get("capabilities", [])]:
                return {"agent_id": agent_id, **cfg}
        return {"agent_id": "unknown", "cooldown_seconds": 0, "capabilities": []}
