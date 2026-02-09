"""
AI-ULU Two-Tier Memory System

Tier 1: Internal Memory (Ajan Hafızası)
- Technical state shared between agents
- File locking for concurrency safety
- RSI history, file locking status, agent coordination

Tier 2: The Vault (Stratejik Hafıza)  
- GodFather decisions and strategic vision
- Repository role assignments
- System-wide policies and classifications
"""

import json
import os
import threading
import time
import platform
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict, field
from enum import Enum
from pathlib import Path


class RepoClass(str, Enum):
    """Repository classification tiers"""
    UNICORN = "unicorn"      # Commercial potential leaders
    MUSCLE = "muscle"        # Infrastructure & libraries
    ARCHIVE = "archive"      # Cleanup candidates
    GODFATHER = "godfather"  # Central governance (this repo)


class DecisionType(str, Enum):
    """Types of strategic decisions"""
    REPO_CLASSIFICATION = "repo_classification"
    AGENT_POLICY = "agent_policy"
    CHAOS_SCENARIO = "chaos_scenario"
    RESOURCE_ALLOCATION = "resource_allocation"
    EMERGENCY_OVERRIDE = "emergency_override"


@dataclass
class StrategicDecision:
    """A decision made by GodFather"""
    id: str
    timestamp: str
    decision_type: DecisionType
    target: str  # repo name or 'system'
    decision: str
    reasoning: str
    expected_outcome: str
    status: str = "active"  # active, revoked, completed
    revoked_at: Optional[str] = None
    revoked_reason: Optional[str] = None


@dataclass  
class RepoRole:
    """Strategic role assigned to a repository"""
    repo_name: str
    assigned_class: RepoClass
    assigned_at: str
    assigned_by: str  # 'godfather', 'auto_classifier', 'manual'
    priority_weight: float = 1.0
    allowed_agents: List[str] = field(default_factory=list)
    chaos_allowed: bool = True
    description: str = ""
    commercial_potential: int = 0  # 0-100
    technical_maturity: int = 0    # 0-100
    strategic_notes: List[str] = field(default_factory=list)


@dataclass
class SystemVision:
    """GodFather's vision for the ecosystem"""
    last_updated: str
    mission_statement: str
    target_aor: float  # Target Autonomous Operation Rate
    target_rsi: float  # Target Resilience Stability Index
    target_mttr: float # Target Mean Time To Repair (minutes)
    strategic_goals: List[str]
    active_initiatives: List[str]
    unicorn_target_count: int = 5
    chaos_schedule: str = "weekly"  # daily, weekly, monthly
    cognitive_depth_target: int = 70


class FileLock:
    """Cross-platform file locking for JSON state files"""
    
    def __init__(self, filepath: str, timeout: float = 10.0):
        self.filepath = filepath
        self.timeout = timeout
        self.lockfile = f"{filepath}.lock"
        self.fd = None
        self.acquired = False
        
    def __enter__(self):
        start = time.time()
        while time.time() - start < self.timeout:
            try:
                # Create lock file exclusively
                self.fd = os.open(self.lockfile, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                # Write PID for debugging
                os.write(self.fd, str(os.getpid()).encode())
                self.acquired = True
                return self
            except FileExistsError:
                # Check if lock is stale (older than timeout)
                try:
                    with open(self.lockfile, 'r') as f:
                        pid = f.read().strip()
                        if pid:
                            # Check if process is still alive (Unix only)
                            try:
                                os.kill(int(pid), 0)
                            except (OSError, ProcessLookupError):
                                # Process is dead, steal the lock
                                os.remove(self.lockfile)
                                continue
                except:
                    pass
                time.sleep(0.01)  # 10ms retry
        
        raise TimeoutError(f"Could not acquire lock for {self.filepath} within {self.timeout}s")
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.fd is not None:
            os.close(self.fd)
        if self.acquired and os.path.exists(self.lockfile):
            try:
                os.remove(self.lockfile)
            except:
                pass
        return False


class InternalMemory:
    """
    Tier 1: Ajan Hafızası
    
    Technical state shared between agents.
    Thread-safe with file locking.
    """
    
    def __init__(self, storage_path: str = "war-room/data/internal_memory.json"):
        self.storage_path = storage_path
        self._local_cache: Dict[str, Any] = {}
        self._cache_ttl = 1.0  # Cache TTL in seconds
        self._last_read = 0.0
        self._lock = threading.RLock()
        self._ensure_storage()
    
    def _ensure_storage(self) -> None:
        """Initialize storage with default structure"""
        if not os.path.exists(self.storage_path):
            os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
            self._write({
                "version": "2.0",
                "activities": [],
                "stats": {
                    "repairs": 0,
                    "total_time": 0.0,
                    "repair_times": [],
                    "operations": 0,
                    "ops_window": [],
                    "panic_count": 0,
                    "panic_resolved": 0,
                    "agent_stats": {},
                },
                "rsi_history": [],  # Historical RSI values
                "file_locks": {},    # Active file locks
                "panic_status": False,
                "panic_reason": None,
                "panic_at": None,
                "last_issue": None,
                "agent_coordination": {
                    "active_agents": [],
                    "claimed_tasks": {},
                    "resource_usage": {}
                }
            })
    
    def _read(self) -> Dict[str, Any]:
        """Read from disk with caching"""
        with self._lock:
            now = time.time()
            if now - self._last_read < self._cache_ttl:
                return self._local_cache.copy()
            
            with FileLock(self.storage_path):
                try:
                    with open(self.storage_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        self._local_cache = data
                        self._last_read = now
                        return data.copy()
                except (OSError, json.JSONDecodeError) as e:
                    # Return cache if available, otherwise re-initialize
                    if self._local_cache:
                        return self._local_cache.copy()
                    self._ensure_storage()
                    return self._read()
    
    def _write(self, data: Dict[str, Any]) -> None:
        """Write to disk with file locking"""
        with FileLock(self.storage_path):
            with open(self.storage_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            with self._lock:
                self._local_cache = data.copy()
                self._last_read = time.time()
    
    def record_rsi(self, rsi: float) -> None:
        """Record RSI value with timestamp for trend analysis"""
        data = self._read()
        history = data.get("rsi_history", [])
        history.append({
            "value": rsi,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        })
        # Keep last 1000 readings
        data["rsi_history"] = history[-1000:]
        self._write(data)
    
    def get_rsi_trend(self, hours: int = 24) -> Dict[str, Any]:
        """Get RSI trend analysis"""
        data = self._read()
        history = data.get("rsi_history", [])
        
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        recent = [
            h for h in history 
            if datetime.fromisoformat(h["timestamp"].replace("Z", "")) > cutoff
        ]
        
        if not recent:
            return {"trend": "unknown", "avg": 0, "min": 0, "max": 0}
        
        values = [h["value"] for h in recent]
        avg = sum(values) / len(values)
        
        # Determine trend
        if len(values) >= 2:
            first_half = sum(values[:len(values)//2]) / (len(values)//2)
            second_half = sum(values[len(values)//2:]) / (len(values) - len(values)//2)
            if second_half > first_half + 2:
                trend = "improving"
            elif second_half < first_half - 2:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "unknown"
        
        return {
            "trend": trend,
            "avg": round(avg, 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "count": len(values)
        }
    
    def claim_task(self, agent_id: str, task_id: str) -> bool:
        """Claim a task for an agent (coordination)"""
        data = self._read()
        coord = data.setdefault("agent_coordination", {})
        claimed = coord.setdefault("claimed_tasks", {})
        
        if task_id in claimed:
            return False  # Already claimed
        
        claimed[task_id] = {
            "agent_id": agent_id,
            "claimed_at": datetime.utcnow().isoformat() + "Z"
        }
        
        active = coord.setdefault("active_agents", [])
        if agent_id not in active:
            active.append(agent_id)
        
        self._write(data)
        return True
    
    def release_task(self, agent_id: str, task_id: str) -> None:
        """Release a claimed task"""
        data = self._read()
        coord = data.get("agent_coordination", {})
        claimed = coord.get("claimed_tasks", {})
        
        if task_id in claimed and claimed[task_id].get("agent_id") == agent_id:
            del claimed[task_id]
            self._write(data)


class TheVault:
    """
    Tier 2: Stratejik Hafıza
    
    GodFather's strategic decisions, repository roles, and system vision.
    This is the source of truth for strategic direction.
    """
    
    VAULT_PATH = "war-room/data/the_vault.json"
    
    def __init__(self):
        self._lock = threading.RLock()
        self._ensure_storage()
    
    def _ensure_storage(self) -> None:
        """Initialize vault with default structure"""
        if not os.path.exists(self.VAULT_PATH):
            os.makedirs(os.path.dirname(self.VAULT_PATH), exist_ok=True)
            self._write({
                "version": "1.0",
                "vision": asdict(SystemVision(
                    last_updated=datetime.utcnow().isoformat() + "Z",
                    mission_statement="Build an autonomous AI engineering ecosystem that self-heals, self-improves, and operates with minimal human intervention.",
                    target_aor=95.0,
                    target_rsi=99.0,
                    target_mttr=3.0,
                    strategic_goals=[
                        "Achieve 95%+ autonomous operation rate",
                        "Maintain RSI above 99%",
                        "Grow unicorn portfolio to 5+ products",
                        "Reduce MTTR to under 3 minutes"
                    ],
                    active_initiatives=[
                        "Chaos engineering expansion",
                        "Multi-LLM integration",
                        "Self-healing pipeline",
                        "War Room dashboard enhancement"
                    ]
                )),
                "decisions": [],
                "repo_roles": {},
                "policy_overrides": {}
            })
    
    def _read(self) -> Dict[str, Any]:
        """Read vault with file locking"""
        with FileLock(self.VAULT_PATH):
            with open(self.VAULT_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    
    def _write(self, data: Dict[str, Any]) -> None:
        """Write vault with file locking"""
        with FileLock(self.VAULT_PATH):
            with open(self.VAULT_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
    
    def record_decision(self, decision_type: DecisionType, target: str, 
                       decision: str, reasoning: str, expected_outcome: str) -> str:
        """Record a strategic decision by GodFather"""
        data = self._read()
        
        dec = StrategicDecision(
            id=f"dec_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{target}",
            timestamp=datetime.utcnow().isoformat() + "Z",
            decision_type=decision_type,
            target=target,
            decision=decision,
            reasoning=reasoning,
            expected_outcome=expected_outcome
        )
        
        data["decisions"].insert(0, asdict(dec))
        # Keep last 1000 decisions
        data["decisions"] = data["decisions"][:1000]
        
        self._write(data)
        return dec.id
    
    def assign_repo_role(self, repo_name: str, role: RepoClass, 
                        assigned_by: str = "godfather", **kwargs) -> None:
        """Assign strategic role to a repository"""
        data = self._read()
        
        repo_role = RepoRole(
            repo_name=repo_name,
            assigned_class=role,
            assigned_at=datetime.utcnow().isoformat() + "Z",
            assigned_by=assigned_by,
            priority_weight=kwargs.get("priority_weight", 1.0),
            allowed_agents=kwargs.get("allowed_agents", []),
            chaos_allowed=kwargs.get("chaos_allowed", True),
            description=kwargs.get("description", ""),
            commercial_potential=kwargs.get("commercial_potential", 0),
            technical_maturity=kwargs.get("technical_maturity", 0),
            strategic_notes=kwargs.get("strategic_notes", [])
        )
        
        data["repo_roles"][repo_name] = asdict(repo_role)
        self._write(data)
        
        # Also record as a decision
        self.record_decision(
            DecisionType.REPO_CLASSIFICATION,
            repo_name,
            f"Classified as {role.value}",
            kwargs.get("reasoning", f"Strategic classification by {assigned_by}"),
            f"Optimized resource allocation for {role.value} tier"
        )
    
    def get_repo_role(self, repo_name: str) -> Optional[Dict[str, Any]]:
        """Get strategic role for a repository"""
        data = self._read()
        return data["repo_roles"].get(repo_name)
    
    def get_vision(self) -> SystemVision:
        """Get current system vision"""
        data = self._read()
        return SystemVision(**data["vision"])
    
    def update_vision(self, **kwargs) -> None:
        """Update system vision"""
        data = self._read()
        vision = data["vision"]
        
        for key, value in kwargs.items():
            if key in vision:
                vision[key] = value
        
        vision["last_updated"] = datetime.utcnow().isoformat() + "Z"
        data["vision"] = vision
        self._write(data)
        
        self.record_decision(
            DecisionType.AGENT_POLICY,
            "system",
            "Vision updated",
            f"Updated fields: {list(kwargs.keys())}",
            "Aligned system goals with new strategic direction"
        )
    
    def get_active_decisions(self, decision_type: Optional[DecisionType] = None) -> List[Dict[str, Any]]:
        """Get active strategic decisions"""
        data = self._read()
        decisions = [d for d in data["decisions"] if d.get("status") == "active"]
        
        if decision_type:
            decisions = [d for d in decisions if d.get("decision_type") == decision_type.value]
        
        return decisions
    
    def revoke_decision(self, decision_id: str, reason: str) -> bool:
        """Revoke a strategic decision"""
        data = self._read()
        
        for dec in data["decisions"]:
            if dec.get("id") == decision_id:
                dec["status"] = "revoked"
                dec["revoked_at"] = datetime.utcnow().isoformat() + "Z"
                dec["revoked_reason"] = reason
                self._write(data)
                return True
        
        return False
    
    def get_kingdom_map(self) -> Dict[str, List[str]]:
        """Get strategic kingdom map"""
        data = self._read()
        roles = data.get("repo_roles", {})
        
        kingdom = {
            "unicorn": [],
            "muscle": [],
            "archive": [],
            "godfather": []
        }
        
        for repo_name, role_data in roles.items():
            role_class = role_data.get("assigned_class", "muscle")
            kingdom[role_class].append(repo_name)
        
        # Add this repo as godfather
        kingdom["godfather"].append(".github")
        
        return kingdom


class UnifiedMemory:
    """
    Unified interface for both memory tiers.
    
    Usage:
        memory = UnifiedMemory()
        
        # Tier 1: Technical operations
        memory.internal.record_rsi(98.5)
        memory.internal.claim_task("repair_agent", "task_123")
        
        # Tier 2: Strategic operations  
        memory.vault.assign_repo_role("GodFather", RepoClass.UNICORN)
        memory.vault.record_decision(DecisionType.CHAOS_SCENARIO, "*", "enable")
    """
    
    def __init__(self):
        self.internal = InternalMemory()
        self.vault = TheVault()
    
    def sync_metrics(self) -> Dict[str, Any]:
        """Synchronize metrics between tiers"""
        # Get RSI trend from internal memory
        rsi_trend = self.internal.get_rsi_trend(hours=24)
        
        # Get vision targets from vault
        vision = self.vault.get_vision()
        
        return {
            "current_rsi_trend": rsi_trend,
            "target_aor": vision.target_aor,
            "target_rsi": vision.target_rsi,
            "target_mttr": vision.target_mttr,
            "gap_analysis": {
                "aor_gap": vision.target_aor - 92.5,  # Current AOR
                "rsi_gap": vision.target_rsi - rsi_trend.get("avg", 98),
                "mttr_gap": 4.2 - vision.target_mttr  # Current MTTR
            }
        }


# Backward compatibility - maintain existing API
class AgentMemory(InternalMemory):
    """Legacy compatibility wrapper"""
    pass


if __name__ == "__main__":
    # Demo usage
    print("🧠 AI-ULU Two-Tier Memory System Demo")
    print("=" * 50)
    
    memory = UnifiedMemory()
    
    # Tier 1: Technical memory
    print("\n📊 Tier 1 - Internal Memory:")
    memory.internal.record_rsi(98.5)
    memory.internal.record_rsi(97.8)
    trend = memory.internal.get_rsi_trend()
    print(f"   RSI Trend: {trend}")
    
    # Tier 2: Strategic memory
    print("\n👑 Tier 2 - The Vault:")
    
    # Assign strategic roles
    memory.vault.assign_repo_role(
        "GodFather", 
        RepoClass.UNICORN,
        reasoning="Central governance system with high commercial potential",
        commercial_potential=95,
        technical_maturity=90
    )
    
    # Record strategic decision
    dec_id = memory.vault.record_decision(
        DecisionType.AGENT_POLICY,
        "system",
        "Enable aggressive chaos testing on muscle tier",
        "Need to validate resilience before scaling",
        "Improved RSI and reduced MTTR"
    )
    print(f"   Decision recorded: {dec_id}")
    
    # Get kingdom map
    kingdom = memory.vault.get_kingdom_map()
    print(f"\n   Kingdom Map:")
    for tier, repos in kingdom.items():
        print(f"      {tier.upper()}: {repos}")
    
    # Sync metrics
    print("\n🔄 Sync Metrics:")
    sync = memory.sync_metrics()
    print(f"   Gap Analysis: {sync['gap_analysis']}")
    
    print("\n✅ Demo complete!")
