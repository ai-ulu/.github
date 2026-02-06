import json
import os
from datetime import datetime
from typing import Dict, List, Any


class AgentMemory:
    def __init__(self, storage_path: str = "war-room/data/agent_memory.json"):
        self.storage_path = storage_path
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        if not os.path.exists(self.storage_path):
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "activities": [],
                        "stats": {"repairs": 0, "total_time": 0.0},
                        "panic_status": False,
                        "panic_reason": None,
                        "panic_at": None,
                    },
                    f,
                    indent=2,
                )

    def _read(self) -> Dict[str, Any]:
        with open(self.storage_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _write(self, data: Dict[str, Any]) -> None:
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def record_event(self, agent_name: str, action: str, result: str) -> None:
        icon = "[OK]" if result.lower() in {"ok", "success", "fixed"} else "[WARN]"
        text = f"{agent_name}: {action} -> {result}"
        self.record_activity(agent_name, text, icon=icon)

    def record_activity(self, agent_name: str, text: str, icon: str = "[#]") -> None:
        data = self._read()
        data["activities"].insert(
            0,
            {
                "icon": icon,
                "text": f"{agent_name}: {text}",
                "time": "Just now",
            },
        )
        data["activities"] = data["activities"][:10]
        self._write(data)

    def record_repair(self, duration_minutes: float) -> None:
        data = self._read()
        stats = data.setdefault("stats", {})
        stats["repairs"] = int(stats.get("repairs", 0)) + 1
        stats["total_time"] = float(stats.get("total_time", 0.0)) + float(
            duration_minutes
        )
        data["last_repair_at"] = datetime.utcnow().isoformat() + "Z"
        self._write(data)

    def set_panic(self, status: bool, reason: str) -> None:
        data = self._read()
        data["panic_status"] = bool(status)
        data["panic_reason"] = reason
        data["panic_at"] = datetime.utcnow().isoformat() + "Z" if status else None
        if status:
            data["activities"].insert(
                0,
                {
                    "icon": "[ALARM]",
                    "text": f"PANIC: {reason}",
                    "time": "Just now",
                },
            )
            data["activities"] = data["activities"][:10]
        self._write(data)

    def get_dashboard_stats(self) -> Dict[str, Any]:
        data = self._read()
        stats = data.get("stats", {})
        repairs = int(stats.get("repairs", 0))
        total_time = float(stats.get("total_time", 0.0))
        mttr = round((total_time / repairs), 2) if repairs > 0 else 0.0
        return {
            "repairs": repairs,
            "total_time": total_time,
            "mttr_est": mttr,
            "last_repair_at": data.get("last_repair_at"),
            "panic_status": data.get("panic_status", False),
            "panic_reason": data.get("panic_reason"),
            "panic_at": data.get("panic_at"),
        }
