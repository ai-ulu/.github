import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.policy_updater import approve_and_apply


def test_approve_and_apply(tmp_path: Path) -> None:
    policy_path = tmp_path / "policy.json"
    queue_path = tmp_path / "classify_queue.json"

    policy_path.write_text(
        json.dumps(
            {
                "repositories": {
                    "ai-ulu/QA": {
                        "class": "unicorn",
                        "priority_weight": 1.3,
                        "allowed_agents": ["REPAIR", "SELF_HEAL", "WATCH"],
                        "chaos_allowed": False,
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    queue_path.write_text(
        json.dumps(
            {
                "pending": [
                    {
                        "repo": "ai-ulu/Nexus-Agi",
                        "current_class": "muscle",
                        "suggested_class": "unicorn",
                    },
                    {
                        "repo": "ai-ulu/GitHubTarayici",
                        "current_class": "muscle",
                        "suggested_class": "archive",
                    },
                ],
                "approved": [],
                "rejected": [],
            }
        ),
        encoding="utf-8",
    )

    applied = approve_and_apply(
        str(policy_path), str(queue_path), {"ai-ulu/Nexus-Agi"}, approve_all=False
    )

    assert applied == 1
    policy = json.loads(policy_path.read_text(encoding="utf-8"))
    assert policy["repositories"]["ai-ulu/Nexus-Agi"]["class"] == "unicorn"

    queue = json.loads(queue_path.read_text(encoding="utf-8"))
    assert len(queue["pending"]) == 1
    assert queue["pending"][0]["repo"] == "ai-ulu/GitHubTarayici"
