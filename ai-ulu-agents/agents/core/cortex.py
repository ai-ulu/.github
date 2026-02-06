import json
import os
from datetime import datetime
from typing import Dict, Any, List


class CortexFilter:
    def __init__(self, log_path: str = "war-room/data/cortex_log.json"):
        self.log_path = log_path
        self._ensure_log()

    def _ensure_log(self) -> None:
        if not os.path.exists(self.log_path):
            os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
            with open(self.log_path, "w", encoding="utf-8") as f:
                json.dump({"entries": []}, f, indent=2)

    def _read(self) -> Dict[str, Any]:
        try:
            with open(self.log_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            self._ensure_log()
            with open(self.log_path, "r", encoding="utf-8") as f:
                return json.load(f)

    def _write(self, data: Dict[str, Any]) -> None:
        with open(self.log_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def evaluate(self, task: Dict[str, Any], memory_metrics: Dict[str, Any]) -> Dict[str, Any]:
        task_type = (task.get("type") or "unknown").upper()
        target = task.get("target", "unknown")
        category = (task.get("category") or "muscle").lower()
        rsi = float(memory_metrics.get("rsi", 0.0))

        # Consultation: check if similar task exists in recent activity
        recent = memory_metrics.get("ops_window", [])
        seen_before = bool(recent)

        # Simulation: chaos risk if RSI low
        chaos_risk = task_type == "CHAOS" and rsi < 90

        # Strategic alignment: prioritize unicorn, de-prioritize archive
        alignment = 8 if category == "unicorn" else 5 if category == "muscle" else 2
        risk_penalty = 2 if chaos_risk else 0
        depth_score = max(1, min(10, alignment - risk_penalty))

        entry = {
            "task_id": task.get("id"),
            "task_type": task_type,
            "target": target,
            "consultation": "similar task seen" if seen_before else "no prior match",
            "simulation": "chaos risk" if chaos_risk else "stable impact",
            "alignment": f"category={category}",
            "score": depth_score,
            "created_at": datetime.utcnow().isoformat() + "Z",
        }

        data = self._read()
        entries: List[Dict[str, Any]] = data.get("entries", [])
        entries.insert(0, entry)
        data["entries"] = entries[:50]
        self._write(data)
        return entry
