# AI-ULU Autonomous Engineering Blueprint

This blueprint describes the target architecture, data flow, and delivery phases for
the ai-ulu autonomous engineering system. It is intended to be implementation-ready
and aligned with the current repo layout.

## Goals
- Closed-loop autonomy: detect -> dispatch -> repair -> verify -> report.
- Observable system: all key actions visible in War Room.
- Minimal friction: simple, deterministic pipelines and file-based handoffs.

## Core Components

### 1) Agent Core (ai-ulu-agents/agents/core)
- `memory.py`: Single source of truth for activity feed, MTTR/RSI stats, and panic state.
- `task_queue.py`: File-backed task queue for orchestration.
- `base_agent.py`: Common error handling, panic and auto-queue for self-heal.

### 2) Agents
- `repair_agent.py`: Detect/report dependency and CI issues.
- `self_healing_agent.py`: Clears panic and records recovery.
- `orchestrator.py`: Dispatches tasks from queue to the correct agent.

### 3) War Room (war-room)
- Static dashboard + matrix visuals.
- Live data from `war-room/data/*.json`.
- Real-time indicators for panic, queue status, and activity feed.

### 4) Metrics & Sync (war-room/api/update-metrics.py)
- Pulls GitHub org data (if token present).
- Computes RSI/MTTR using agent memory.
- Updates `metrics.json`, `agent-log.json`, `repos.json`.

## Data Flow (Closed Loop)
1. Agent error triggers panic and auto-enqueues a `SELF_HEAL` task.
2. Orchestrator picks tasks (priority-first) and dispatches agents.
3. Agents record actions in `agent_memory.json`.
4. `update-metrics.py` derives RSI/MTTR + chaos stats for dashboard.

## Phases & Deliverables

### Phase 1: War Room Foundation (Done)
- Dashboard UI, matrix visuals, and auto-deploy workflow.
- JSON data feeds for metrics, repo health, agent activity.

### Phase 2: Agent Core (Done)
- Memory, base agent, repair agent, panic mode and self-heal.

### Phase 3: Orchestration (In Progress)
- Task queue + orchestrator loop.
- Priority sorting and queue visualization.

### Phase 4: Recovery Automation (Next)
- Health checks auto-enqueue `SELF_HEAL` on panic.
- Optional daemon runner on server.

### Phase 5: Multi-Agent Coordination (Planned)
- Agent capabilities registry.
- Load-aware dispatch (cooldown / success rate).
- Multi-repo routing and allowlist policies.

## Runbook (Local)

### Simulate panic + auto-heal
```bash
python - <<'PY'
import sys, threading, time
from pathlib import Path
sys.path.insert(0, str(Path('ai-ulu-agents').resolve()))
from agents.orchestrator import Orchestrator
from agents.repair_agent import RepairAgent

orch = Orchestrator(poll_seconds=1)
threading.Thread(target=orch.run_forever, daemon=True).start()

RepairAgent().simulate_panic()
time.sleep(2)
print('done')
PY
```

### Refresh metrics
```bash
python war-room/api/update-metrics.py
```

## Guardrails
- Never publish private repo data into `war-room/data/*.json`.
- Keep panic auto-queue enabled.
- Prefer small, deterministic changes per phase.
