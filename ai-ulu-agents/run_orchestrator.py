import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from agents.orchestrator import Orchestrator


def main() -> None:
    Orchestrator().run_forever()


if __name__ == "__main__":
    main()
