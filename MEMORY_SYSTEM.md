# AI-ULU Two-Tier Memory System 🧠

## Overview

The AI-ULU memory system implements a **two-tier architecture** that separates technical operations from strategic decision-making:

```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED MEMORY                            │
├─────────────────────────┬───────────────────────────────────┤
│   TIER 1: INTERNAL      │    TIER 2: THE VAULT              │
│   (Ajan Hafızası)       │    (Stratejik Hafıza)             │
├─────────────────────────┼───────────────────────────────────┤
│ • RSI History           │ • GodFather Decisions             │
│ • File Locking Status   │ • Repository Roles                │
│ • Agent Coordination    │ • System Vision                   │
│ • Task Claims           │ • Strategic Goals                 │
│ • Technical Metrics     │ • Kingdom Map                     │
└─────────────────────────┴───────────────────────────────────┘
```

---

## Architecture

### Tier 1: Internal Memory (Ajan Hafızası)

Technical state shared between autonomous agents. Optimized for high-frequency reads/writes with caching and file locking.

**Features:**
- ✅ Cross-platform file locking (prevents JSON corruption)
- ✅ In-memory caching (1-second TTL)
- ✅ RSI trend analysis (24-hour window)
- ✅ Agent task coordination (claim/release)
- ✅ Backward compatible with `AgentMemory` v1

**Storage:** `war-room/data/internal_memory.json`

```python
from ai-ulu-agents.agents.core.memory_v2 import InternalMemory

memory = InternalMemory()

# Record RSI for trend analysis
memory.record_rsi(98.5)

# Get 24-hour trend
trend = memory.get_rsi_trend(hours=24)
print(f"RSI Trend: {trend['trend']} (avg: {trend['avg']})")

# Coordinate agent tasks
if memory.claim_task("repair_agent", "task_123"):
    print("Task claimed successfully")
    # ... do work ...
    memory.release_task("repair_agent", "task_123")
```

### Tier 2: The Vault (Stratejik Hafıza)

Strategic memory for GodFather decisions, repository roles, and system vision. Audit trail for all strategic changes.

**Features:**
- ✅ Decision tracking with reasoning
- ✅ Repository classification (Unicorn/Muscle/Archive)
- ✅ System vision management
- ✅ Kingdom map generation
- ✅ Decision revocation support

**Storage:** `war-room/data/the_vault.json`

```python
from ai-ulu-agents.agents.core.memory_v2 import TheVault, RepoClass, DecisionType

vault = TheVault()

# Assign strategic role to repository
vault.assign_repo_role(
    "GodFather",
    RepoClass.UNICORN,
    reasoning="Central governance with high commercial potential",
    commercial_potential=95,
    technical_maturity=90
)

# Record strategic decision
decision_id = vault.record_decision(
    DecisionType.CHAOS_SCENARIO,
    "*",
    "Enable weekly chaos testing",
    "Validate resilience before scaling",
    "Improved RSI metrics"
)

# Get kingdom map
kingdom = vault.get_kingdom_map()
print(f"Unicorns: {kingdom['unicorn']}")
```

---

## Unified Interface

For convenience, use the `UnifiedMemory` class to access both tiers:

```python
from ai-ulu-agents.agents.core.memory_v2 import UnifiedMemory

memory = UnifiedMemory()

# Tier 1: Technical
memory.internal.record_rsi(98.5)
memory.internal.claim_task("agent", "task_001")

# Tier 2: Strategic
memory.vault.assign_repo_role("MyRepo", RepoClass.MUSCLE)
memory.vault.record_decision(DecisionType.AGENT_POLICY, "*", "policy_change")

# Sync metrics between tiers
sync = memory.sync_metrics()
print(f"AOR Gap: {sync['gap_analysis']['aor_gap']}")
```

---

## File Locking Mechanism

Prevents race conditions when multiple agents access JSON files simultaneously.

**How it works:**
1. Creates `{filename}.lock` file exclusively (atomic operation)
2. Writes PID to lock file for debugging
3. Stale lock detection (if process dies, lock is auto-released)
4. 10-second timeout with 10ms retry intervals

**Windows/Linux Compatible:** Uses OS-agnostic file creation flags.

---

## Data Structures

### Repository Classification

```python
class RepoClass(str, Enum):
    UNICORN = "unicorn"      # High commercial potential
    MUSCLE = "muscle"        # Infrastructure/libraries
    ARCHIVE = "archive"      # Cleanup candidates
    GODFATHER = "godfather"  # Central governance
```

### Decision Types

```python
class DecisionType(str, Enum):
    REPO_CLASSIFICATION = "repo_classification"
    AGENT_POLICY = "agent_policy"
    CHAOS_SCENARIO = "chaos_scenario"
    RESOURCE_ALLOCATION = "resource_allocation"
    EMERGENCY_OVERRIDE = "emergency_override"
```

### System Vision

```json
{
  "mission_statement": "Build an autonomous AI engineering ecosystem...",
  "target_aor": 95.0,
  "target_rsi": 99.0,
  "target_mttr": 3.0,
  "strategic_goals": [
    "Achieve 95%+ autonomous operation rate",
    "Maintain RSI above 99%",
    "Grow unicorn portfolio to 5+ products"
  ]
}
```

---

## RSI Trend Analysis

The system tracks RSI (Resilience Stability Index) over time:

```python
# Record multiple RSI values
memory.record_rsi(98.5)
memory.record_rsi(97.8)
memory.record_rsi(96.2)

# Get trend analysis
trend = memory.get_rsi_trend(hours=24)
# Returns:
# {
#   "trend": "declining",  # improving | stable | declining
#   "avg": 97.5,
#   "min": 96.2,
#   "max": 98.5,
#   "count": 3
# }
```

---

## Integration with Existing Code

The new system is **backward compatible** with the existing `AgentMemory` class:

```python
# Old code (still works)
from agents.core.memory import AgentMemory

memory = AgentMemory()
memory.record_repair(5.0)

# New code (recommended)
from agents.core.memory_v2 import UnifiedMemory

memory = UnifiedMemory()
memory.internal.record_repair(5.0)  # Same functionality
```

---

## File Structure

```
war-room/data/
├── internal_memory.json    # Tier 1: Technical state
│   ├── rsi_history[]       # RSI trend data
│   ├── agent_coordination  # Task claims
│   └── stats               # Operation metrics
│
└── the_vault.json          # Tier 2: Strategic state
    ├── vision              # System goals
    ├── decisions[]         # Decision log
    └── repo_roles{}        # Repository classifications
```

---

## Testing

Run the demo:

```bash
cd ai-ulu-agents/agents/core
python memory_v2.py
```

Expected output:
```
🧠 AI-ULU Two-Tier Memory System Demo
==================================================

📊 Tier 1 - Internal Memory:
   RSI Trend: {'trend': 'stable', 'avg': 98.15, ...}

👑 Tier 2 - The Vault:
   Decision recorded: dec_20260208213102_system

   Kingdom Map:
      UNICORN: ['GodFather']
      MUSCLE: []
      ARCHIVE: []
      GODFATHER: ['.github']

🔄 Sync Metrics:
   Gap Analysis: {'aor_gap': 2.5, 'rsi_gap': 0.85, ...}

✅ Demo complete!
```

---

## Migration Guide

### From AgentMemory (v1) to UnifiedMemory (v2)

**Step 1:** Update imports
```python
# Old
from agents.core.memory import AgentMemory

# New
from agents.core.memory_v2 import UnifiedMemory, InternalMemory
```

**Step 2:** Update instantiation
```python
# Old
memory = AgentMemory()

# New
memory = UnifiedMemory()
# or for technical only:
memory = InternalMemory()
```

**Step 3:** Update method calls
```python
# Old (still works via compatibility layer)
memory.record_repair(5.0)

# New (explicit tier)
memory.internal.record_repair(5.0)
```

**Step 4:** Add strategic features
```python
# New capability - strategic decisions
memory.vault.record_decision(
    DecisionType.AGENT_POLICY,
    "system",
    "Enable chaos testing",
    "...",
    "..."
)
```

---

## Best Practices

1. **Use UnifiedMemory** for new code to access both tiers
2. **Record RSI regularly** for accurate trend analysis
3. **Claim tasks before processing** to prevent duplicate work
4. **Document decisions** with clear reasoning in The Vault
5. **Revoke outdated decisions** instead of deleting them
6. **Check gap_analysis** to track progress toward goals

---

## Future Enhancements

- [ ] WebSocket integration for real-time updates
- [ ] SQLite backend option for high-scale deployments
- [ ] Decision impact tracking (expected vs actual outcomes)
- [ ] Automatic kingdom map optimization suggestions
- [ ] Integration with War Room dashboard

---

## License

Part of the AI-ULU autonomous engineering ecosystem.

---

*"Not a framework. Not a platform. An Operating System for AI."*