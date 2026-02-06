import uuid
from typing import Optional

from .memory import AgentMemory
from .task_queue import TaskQueue
from .reporter import maybe_report_issue


class BaseAgent:
    def __init__(self, name: str, memory: Optional[AgentMemory] = None):
        self.name = name
        self.memory = memory or AgentMemory()

    def run(self, action: str, func, *args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            self.on_error(action, exc)
            return None

    def log_event(self, action: str, result: str) -> None:
        self.memory.record_event(self.name, action, result)

    def log_activity(self, text: str, icon: str = "[#]", task_id: str = "") -> None:
        self.memory.record_activity(self.name, text, icon=icon, task_id=task_id)

    def on_error(self, action: str, error: Exception) -> None:
        reason = f"{self.name} failed during {action}: {error}"
        self.memory.set_panic(True, reason)
        maybe_report_issue(self.name, reason)
        queue = TaskQueue()
        queue.enqueue(
            {
                "id": f"task_{uuid.uuid4().hex[:8]}",
                "type": "SELF_HEAL",
                "target": self.name,
                "priority": "high",
            }
        )
        self.log_event(action, f"error: {error}")
