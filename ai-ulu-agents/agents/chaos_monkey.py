from typing import Optional, Dict, Any

from .core.base_agent import BaseAgent
from .core.memory import AgentMemory
from .core.task_queue import TaskQueue


class ChaosMonkey(BaseAgent):
    def __init__(self, memory: Optional[AgentMemory] = None, queue: Optional[TaskQueue] = None):
        super().__init__(name="ChaosMonkey", memory=memory)
        self.queue = queue or TaskQueue()

    def schedule_chaos(
        self,
        target: str,
        scenario: str,
        priority: str = "normal",
        impact: str = "normal",
        category: str = "muscle",
    ) -> None:
        task: Dict[str, Any] = {
            "type": "CHAOS",
            "target": target,
            "priority": priority,
            "impact": impact,
            "category": category,
            "scenario": scenario,
        }
        self.queue.enqueue(task)
        self.log_activity(f"Queued chaos scenario '{scenario}' for {target}", icon="[CHAOS]")
