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
        task_id = task.get("id", "")
        if task_type == "REPAIR":
            agent = RepairAgent(memory=self.memory)
            target = task.get("target", "unknown")
            agent.report_dependency_issue(target, "queued repair")
            self.log_activity(f"Dispatched repair to {target}", icon="[REPAIR]", task_id=task_id)
            return "repair_dispatched"
        if task_type == "SELF_HEAL":
            agent = SelfHealingAgent(memory=self.memory)
            metrics = self.memory.get_sync_metrics()
            if not metrics.get("panic_status"):
                self.log_activity("Self-heal skipped (no panic)", icon="[HEAL]", task_id=task_id)
                return "self_heal_skipped"
            agent.check_system_health()
            self.log_activity("Dispatched self-heal", icon="[HEAL]", task_id=task_id)
            return "self_heal_dispatched"
        self.log_activity(f"Unknown task type: {task_type}", icon="[WARN]")
        return "unknown_task"

    def run_once(self) -> None:
        metrics = self.memory.get_sync_metrics()
        if metrics.get("panic_status") and not self.queue.has_task("SELF_HEAL"):
            self.queue.enqueue(
                {
                    "type": "SELF_HEAL",
                    "target": "system",
                    "priority": "high",
                }
            )
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
