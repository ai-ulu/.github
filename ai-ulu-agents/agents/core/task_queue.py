import json
import os
from datetime import datetime
from typing import Dict, Any, List


class TaskQueue:
    def __init__(self, storage_path: str = "war-room/data/task_queue.json"):
        self.storage_path = storage_path
        self._ensure_storage()

    def _ensure_storage(self) -> None:
        if not os.path.exists(self.storage_path):
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            self._write({"pending": [], "in_progress": [], "completed": []})

    def _read(self) -> Dict[str, List[Dict[str, Any]]]:
        try:
            with open(self.storage_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            self._ensure_storage()
            with open(self.storage_path, "r", encoding="utf-8") as f:
                return json.load(f)

    def _write(self, data: Dict[str, List[Dict[str, Any]]]) -> None:
        with open(self.storage_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def enqueue(self, task: Dict[str, Any]) -> None:
        data = self._read()
        task = {
            "id": task.get("id") or f"task_{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}",
            "type": task.get("type"),
            "target": task.get("target"),
            "priority": task.get("priority", "normal"),
            "impact": task.get("impact", "normal"),
            "category": task.get("category", "muscle"),
            "created_at": task.get("created_at") or datetime.utcnow().isoformat() + "Z",
        }
        data["pending"].append(task)
        self._write(data)

    def dequeue(self) -> Dict[str, Any]:
        data = self._read()
        task = self.get_next_task(data)
        if not task:
            return {}
        task_id = task.get("id")
        pending = data.get("pending", [])
        if task_id:
            data["pending"] = [t for t in pending if t.get("id") != task_id]
        else:
            data["pending"] = pending[1:]
        task["started_at"] = datetime.utcnow().isoformat() + "Z"
        data["in_progress"].append(task)
        self._write(data)
        return task

    def pop_by_id(self, task_id: str) -> Dict[str, Any]:
        if not task_id:
            return {}
        data = self._read()
        pending = data.get("pending", [])
        task = next((t for t in pending if t.get("id") == task_id), None)
        if not task:
            return {}
        data["pending"] = [t for t in pending if t.get("id") != task_id]
        task["started_at"] = datetime.utcnow().isoformat() + "Z"
        data["in_progress"].append(task)
        self._write(data)
        return task

    def get_next_task(self, data: Dict[str, List[Dict[str, Any]]]) -> Dict[str, Any]:
        pending = data.get("pending", [])
        if not pending:
            return {}
        high = [t for t in pending if (t.get("priority") or "").lower() == "high"]
        normal = [t for t in pending if (t.get("priority") or "").lower() != "high"]
        return (high + normal)[0]

    def complete(self, task: Dict[str, Any], result: str) -> None:
        data = self._read()
        task_id = task.get("id")
        in_progress = data.get("in_progress", [])
        remaining = [t for t in in_progress if t.get("id") != task_id]
        task["completed_at"] = datetime.utcnow().isoformat() + "Z"
        task["result"] = result
        data["in_progress"] = remaining
        data["completed"].append(task)
        self._write(data)

    def snapshot(self) -> Dict[str, Any]:
        data = self._read()
        return {
            "pending": data.get("pending", []),
            "in_progress": data.get("in_progress", []),
            "completed": data.get("completed", []),
        }

    def has_task(self, task_type: str) -> bool:
        data = self._read()
        task_type = (task_type or "").upper()
        for bucket in ("pending", "in_progress"):
            for task in data.get(bucket, []):
                if (task.get("type") or "").upper() == task_type:
                    return True
        return False
