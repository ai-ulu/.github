import time
from typing import Optional

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory
from .core.task_queue import TaskQueue
from .repair_agent import RepairAgent
from .self_healing_agent import SelfHealingAgent


class Orchestrator(BaseAgent):
    def __init__(
        self,
        memory: Optional[AgentMemory] = None,
        queue: Optional[TaskQueue] = None,
        poll_seconds: int = 10,
    ):
        super().__init__(name="Orchestrator", memory=memory)
        self.queue = queue or TaskQueue()
        self.poll_seconds = poll_seconds

    def dispatch(self, task):
        task_type = (task.get("type") or "").upper()
        if task_type == "REPAIR":
            agent = RepairAgent(memory=self.memory)
            agent.report_dependency_issue(task.get("target", "unknown"), "queued repair")
            return "repair_dispatched"
        if task_type == "SELF_HEAL":
            agent = SelfHealingAgent(memory=self.memory)
            agent.check_system_health()
            return "self_heal_dispatched"
        self.log_activity(f"Unknown task type: {task_type}", icon="[WARN]")
        return "unknown_task"

    def run_once(self) -> None:
        task = self.queue.dequeue()
        if not task:
            return
        result = self.dispatch(task)
        self.queue.complete(task, result)

    def run_forever(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.poll_seconds)


if __name__ == "__main__":
    Orchestrator().run_forever()
