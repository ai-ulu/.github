import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.core.cortex import CortexFilter


def test_cortex_writes_log(tmp_path: Path) -> None:
    log_path = tmp_path / "cortex_log.json"
    cortex = CortexFilter(str(log_path))
    entry = cortex.evaluate(
        {"id": "t1", "type": "REPAIR", "target": "ai-ulu/QA", "category": "unicorn"},
        {"rsi": 98, "ops_window": [1, 1, 1]},
    )
    data = json.loads(log_path.read_text(encoding="utf-8"))
    assert data["entries"][0]["task_id"] == "t1"
    assert entry["score"] >= 1
