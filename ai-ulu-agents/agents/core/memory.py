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
                        "stats": {
                            "repairs": 0,
                            "total_time": 0.0,
                            "repair_times": [],
                            "operations": 0,
                            "ops_window": [],
                            "panic_count": 0,
                            "panic_resolved": 0,
                        },
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
        result_lower = result.lower()
        is_success = result_lower in {"ok", "success", "fixed"}
        icon = "[OK]" if is_success else "[WARN]"
        text = f"{agent_name}: {action} -> {result}"
        self.record_activity(agent_name, text, icon=icon)
        data = self._read()
        stats = data.setdefault("stats", {})
        stats["operations"] = int(stats.get("operations", 0)) + 1
        ops_window = list(stats.get("ops_window", []))
        ops_window.append(1 if is_success else 0)
        stats["ops_window"] = ops_window[-20:]
        self._write(data)

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
        repair_times = list(stats.get("repair_times", []))
        repair_times.append(float(duration_minutes))
        stats["repair_times"] = repair_times[-100:]
        stats["total_time"] = float(stats.get("total_time", 0.0)) + float(
            duration_minutes
        )
        data["last_repair_at"] = datetime.utcnow().isoformat() + "Z"
        self._write(data)

    def set_panic(self, status: bool, reason: str) -> None:
        data = self._read()
        was_panic = bool(data.get("panic_status", False))
        data["panic_status"] = bool(status)
        data["panic_reason"] = reason
        data["panic_at"] = datetime.utcnow().isoformat() + "Z" if status else None
        stats = data.setdefault("stats", {})
        if status and not was_panic:
            stats["panic_count"] = int(stats.get("panic_count", 0)) + 1
        if not status and was_panic:
            stats["panic_resolved"] = int(stats.get("panic_resolved", 0)) + 1
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

    def get_sync_metrics(self) -> Dict[str, Any]:
        data = self._read()
        stats = data.get("stats", {})
        repairs = int(stats.get("repairs", 0))
        total_time = float(stats.get("total_time", 0.0))
        repair_times = list(stats.get("repair_times", []))
        operations = int(stats.get("operations", 0))
        ops_window = list(stats.get("ops_window", []))
        panic_count = int(stats.get("panic_count", 0))
        panic_resolved = int(stats.get("panic_resolved", 0))
        mttr = (
            round(sum(repair_times) / len(repair_times), 2)
            if repair_times
            else round((total_time / repairs), 2)
            if repairs > 0
            else 0.0
        )
        total_ops = len(ops_window)
        ops_success = sum(ops_window)
        success_rate = (ops_success / total_ops) * 100 if total_ops > 0 else 0.0
        recovery_bonus = (
            (panic_resolved / max(1, panic_count)) * 5 if panic_count > 0 else 0.0
        )
        rsi = min(99.9, round(success_rate + recovery_bonus, 1))
        return {
            "repairs": repairs,
            "total_time": total_time,
            "mttr": mttr,
            "rsi": rsi,
            "operations": operations,
            "ops_window": ops_window,
            "panic_count": panic_count,
            "panic_resolved": panic_resolved,
            "panic_status": data.get("panic_status", False),
            "panic_reason": data.get("panic_reason"),
            "panic_at": data.get("panic_at"),
        }

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
