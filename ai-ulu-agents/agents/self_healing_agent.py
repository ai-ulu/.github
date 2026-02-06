from typing import Optional

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory
from .core.reporter import maybe_close_issue


class SelfHealingAgent(BaseAgent):
    def __init__(self, memory: Optional[AgentMemory] = None):
        super().__init__(name="SelfHealingAgent", memory=memory)

    def check_system_health(self) -> None:
        metrics = self.memory.get_sync_metrics()
        if metrics.get("panic_status"):
            self.heal(metrics.get("panic_reason"))

    def heal(self, reason: Optional[str]) -> None:
        self.log_activity(
            f"Healing process initiated. Resolving panic: {reason or 'unknown'}",
            icon="[+]",
        )
        self.memory.set_panic(False, "System restored by SelfHealingAgent")
        last_issue = self.memory.get_last_issue()
        if last_issue:
            maybe_close_issue(last_issue.get("repo", ""), int(last_issue.get("number", 0)))
            self.memory.clear_last_issue()
