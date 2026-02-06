from typing import Optional

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory


class RepairAgent(BaseAgent):
    def __init__(self, memory: Optional[AgentMemory] = None):
        super().__init__(name="RepairAgent", memory=memory)

    def report_dependency_issue(self, repo: str, detail: str) -> None:
        self.log_activity(f"Detected dependency issue in {repo}: {detail}", icon="[WARN]")

    def report_fix(self, repo: str, detail: str, duration_minutes: float) -> None:
        self.memory.record_repair(duration_minutes)
        self.log_event(f"Fixed issue in {repo}", detail)
