import json
import os
from typing import Optional, Dict, Any, List

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory
from .core.task_queue import TaskQueue


class Watcher(BaseAgent):
    def __init__(self, memory: Optional[AgentMemory] = None, queue: Optional[TaskQueue] = None):
        super().__init__(name="Watcher", memory=memory)
        self.queue = queue or TaskQueue()
        self.watchlist_path = os.path.join("war-room", "data", "watchlist.json")

    def _read_watchlist(self) -> List[Dict[str, Any]]:
        if not os.path.exists(self.watchlist_path):
            return []
        with open(self.watchlist_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("items", [])

    def scan_and_enqueue(self) -> int:
        items = self._read_watchlist()
        enqueued = 0
        for item in items:
            repo = item.get("repo")
            package = item.get("package")
            if not repo or not package:
                continue
            task = {
                "type": "WATCH",
                "target": repo,
                "priority": item.get("priority", "normal"),
                "impact": item.get("impact", "normal"),
                "category": item.get("category", "muscle"),
                "package": package,
                "note": item.get("note", "update check"),
            }
            self.queue.enqueue(task)
            enqueued += 1
        if enqueued:
            self.log_activity(f"Enqueued {enqueued} watch tasks", icon="[WATCH]")
        return enqueued
