import json
import sys
from pathlib import Path


def load_policy(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python war-room/api/set-cognitive-threshold.py <0-100>")
        return 1
    try:
        value = float(sys.argv[1])
    except ValueError:
        print("Threshold must be a number")
        return 1
    if value < 0 or value > 100:
        print("Threshold must be between 0 and 100")
        return 1

    policy_path = Path("war-room/data/policy.json")
    data = load_policy(policy_path)
    thresholds = data.setdefault("global_thresholds", {})
    thresholds["min_cognitive_threshold"] = value
    policy_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated min_cognitive_threshold to {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
