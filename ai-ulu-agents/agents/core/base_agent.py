from typing import Optional

from .memory import AgentMemory


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

    def log_activity(self, text: str, icon: str = "[#]") -> None:
        self.memory.record_activity(self.name, text, icon=icon)

    def on_error(self, action: str, error: Exception) -> None:
        reason = f"{self.name} failed during {action}: {error}"
        self.memory.set_panic(True, reason)
        self.log_event(action, f"error: {error}")
