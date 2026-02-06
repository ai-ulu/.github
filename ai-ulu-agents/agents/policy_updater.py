import argparse
import json
import os
from typing import Dict, Any, List, Set


def read_json(path: str, default: Dict[str, Any]) -> Dict[str, Any]:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def write_json(path: str, data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def apply_class_change(
    policy: Dict[str, Any],
    repo: str,
    new_class: str,
) -> None:
    repos = policy.setdefault("repositories", {})
    entry = repos.get(repo, {})
    if not entry:
        entry = {
            "class": new_class,
            "priority_weight": 1.0,
            "allowed_agents": ["REPAIR", "SELF_HEAL", "WATCH"],
            "chaos_allowed": new_class != "unicorn",
        }
    entry["class"] = new_class
    entry["chaos_allowed"] = False if new_class == "unicorn" else entry.get("chaos_allowed", True)
    repos[repo] = entry


def approve_and_apply(
    policy_path: str,
    queue_path: str,
    approve_repos: Set[str],
    approve_all: bool,
) -> int:
    policy = read_json(policy_path, {})
    queue = read_json(queue_path, {"pending": [], "approved": [], "rejected": []})
    pending: List[Dict[str, Any]] = queue.get("pending", [])

    approved_items: List[Dict[str, Any]] = []
    remaining: List[Dict[str, Any]] = []

    for item in pending:
        repo = item.get("repo")
        if approve_all or (repo in approve_repos):
            approved_items.append(item)
            apply_class_change(policy, repo, item.get("suggested_class", "muscle"))
        else:
            remaining.append(item)

    if approved_items:
        queue["approved"] = queue.get("approved", []) + approved_items
    queue["pending"] = remaining

    write_json(policy_path, policy)
    write_json(queue_path, queue)
    return len(approved_items)


def main() -> None:
    parser = argparse.ArgumentParser(description="Approve classifier proposals and update policy.json")
    parser.add_argument("--policy", default=os.path.join("war-room", "data", "policy.json"))
    parser.add_argument("--queue", default=os.path.join("war-room", "data", "classify_queue.json"))
    parser.add_argument("--approve", default="", help="Comma-separated repo list to approve")
    parser.add_argument("--approve-all", action="store_true", help="Approve all pending items")
    args = parser.parse_args()

    approve_repos = {r.strip() for r in args.approve.split(",") if r.strip()}
    applied = approve_and_apply(args.policy, args.queue, approve_repos, args.approve_all)
    print(f"approved {applied}")


if __name__ == "__main__":
    main()
