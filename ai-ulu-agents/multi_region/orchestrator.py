"""
AI-ULU Multi-Region Orchestrator (Phase 11)
Global distributed orchestration with auto-failover
"""

import asyncio
import json
import hashlib
from datetime import datetime
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, asdict
from pathlib import Path
import logging
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Region:
    """Represents a deployment region"""
    id: str
    name: str
    location: str
    endpoint: str
    websocket_url: str
    status: str = "unknown"  # healthy, degraded, offline
    latency_ms: float = 0.0
    last_heartbeat: Optional[datetime] = None
    active_agents: int = 0
    load_factor: float = 0.0  # 0.0 - 1.0
    
    def to_dict(self) -> Dict:
        return {
            **asdict(self),
            'last_heartbeat': self.last_heartbeat.isoformat() if self.last_heartbeat else None
        }


@dataclass
class GlobalTask:
    """A task that can be distributed across regions"""
    id: str
    type: str
    payload: Dict[str, Any]
    priority: int = 5  # 1-10
    preferred_regions: List[str] = None
    required_regions: List[str] = None  # Must run in all these regions
    created_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()
        if self.preferred_regions is None:
            self.preferred_regions = []
        if self.required_regions is None:
            self.required_regions = []


class CRDTState:
    """
    Conflict-free Replicated Data Type for state sync
    across regions without conflicts
    """
    
    def __init__(self):
        self.state: Dict[str, Any] = {}
        self.timestamps: Dict[str, datetime] = {}
        self.vector_clock: Dict[str, int] = {}
    
    def update(self, key: str, value: Any, region_id: str, timestamp: datetime):
        """Update with conflict resolution (last-write-wins)"""
        current_ts = self.timestamps.get(key)
        
        if current_ts is None or timestamp > current_ts:
            self.state[key] = value
            self.timestamps[key] = timestamp
            
            # Update vector clock
            self.vector_clock[region_id] = self.vector_clock.get(region_id, 0) + 1
            
            return True
        
        return False  # Conflict: older timestamp
    
    def get(self, key: str) -> Any:
        return self.state.get(key)
    
    def merge(self, other: 'CRDTState') -> 'CRDTState':
        """Merge two CRDT states"""
        merged = CRDTState()
        
        # Merge state
        all_keys = set(self.state.keys()) | set(other.state.keys())
        
        for key in all_keys:
            self_ts = self.timestamps.get(key, datetime.min)
            other_ts = other.timestamps.get(key, datetime.min)
            
            if self_ts >= other_ts:
                merged.state[key] = self.state.get(key)
                merged.timestamps[key] = self_ts
            else:
                merged.state[key] = other.state.get(key)
                merged.timestamps[key] = other_ts
        
        # Merge vector clocks (take max)
        all_regions = set(self.vector_clock.keys()) | set(other.vector_clock.keys())
        for region in all_regions:
            merged.vector_clock[region] = max(
                self.vector_clock.get(region, 0),
                other.vector_clock.get(region, 0)
            )
        
        return merged
    
    def to_dict(self) -> Dict:
        return {
            'state': self.state,
            'timestamps': {k: v.isoformat() for k, v in self.timestamps.items()},
            'vector_clock': self.vector_clock
        }


class MultiRegionOrchestrator:
    """
    Global orchestrator for multi-region deployments.
    
    Features:
    - Region health monitoring
    - Latency-based routing
    - Auto-failover
    - CRDT state sync
    - Global load balancing
    """
    
    def __init__(self, config_path: str = "ai-ulu-agents/multi_region/config.json"):
        self.config_path = Path(config_path)
        self.regions: Dict[str, Region] = {}
        self.global_state = CRDTState()
        self.active_tasks: Dict[str, GlobalTask] = {}
        self.primary_region: Optional[str] = None
        
        self.heartbeat_interval = 30  # seconds
        self.sync_interval = 60  # seconds
        self.failover_threshold = 3  # consecutive failures
        
        self.region_failures: Dict[str, int] = {}
        
        self._load_config()
    
    def _load_config(self):
        """Load region configuration"""
        if self.config_path.exists():
            with open(self.config_path) as f:
                config = json.load(f)
                for region_data in config.get('regions', []):
                    region = Region(**region_data)
                    self.regions[region.id] = region
        else:
            # Default regions
            self.regions = {
                'us-west': Region(
                    id='us-west',
                    name='US West',
                    location='Oregon',
                    endpoint='https://us-west.ai-ulu.io',
                    websocket_url='wss://us-west.ai-ulu.io/ws'
                ),
                'eu-central': Region(
                    id='eu-central',
                    name='EU Central',
                    location='Frankfurt',
                    endpoint='https://eu-central.ai-ulu.io',
                    websocket_url='wss://eu-central.ai-ulu.io/ws'
                ),
                'asia-pacific': Region(
                    id='asia-pacific',
                    name='Asia Pacific',
                    location='Singapore',
                    endpoint='https://asia-pacific.ai-ulu.io',
                    websocket_url='wss://asia-pacific.ai-ulu.io/ws'
                )
            }
            self._save_config()
    
    def _save_config(self):
        """Save region configuration"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, 'w') as f:
            json.dump({
                'regions': [r.to_dict() for r in self.regions.values()]
            }, f, indent=2)
    
    async def start(self):
        """Start the multi-region orchestrator"""
        logger.info("🌍 Multi-Region Orchestrator starting...")
        logger.info(f"   Regions: {list(self.regions.keys())}")
        
        # Start background tasks
        await asyncio.gather(
            self._heartbeat_loop(),
            self._sync_loop(),
            self._failover_monitor()
        )
    
    async def _heartbeat_loop(self):
        """Continuously check region health"""
        while True:
            await self._check_all_regions()
            await asyncio.sleep(self.heartbeat_interval)
    
    async def _check_all_regions(self):
        """Check health of all regions"""
        tasks = [self._check_region(region) for region in self.regions.values()]
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _check_region(self, region: Region):
        """Check health of a single region"""
        try:
            start = datetime.utcnow()
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{region.endpoint}/health",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        region.status = "healthy"
                        region.latency_ms = (datetime.utcnow() - start).total_seconds() * 1000
                        region.last_heartbeat = datetime.utcnow()
                        region.active_agents = data.get('active_agents', 0)
                        region.load_factor = data.get('load_factor', 0.0)
                        
                        # Reset failure count
                        self.region_failures[region.id] = 0
                        
                        logger.debug(f"✅ {region.id}: healthy ({region.latency_ms:.0f}ms)")
                    else:
                        raise Exception(f"HTTP {response.status}")
                        
        except Exception as e:
            self.region_failures[region.id] = self.region_failures.get(region.id, 0) + 1
            
            if self.region_failures[region.id] >= self.failover_threshold:
                region.status = "offline"
                logger.error(f"❌ {region.id}: MARKED OFFLINE ({self.region_failures[region.id]} failures)")
            else:
                region.status = "degraded"
                logger.warning(f"⚠️ {region.id}: degraded ({self.region_failures[region.id]} failures)")
    
    async def _sync_loop(self):
        """Continuously sync state across regions"""
        while True:
            await asyncio.sleep(self.sync_interval)
            await self._sync_state()
    
    async def _sync_state(self):
        """Sync global state across all healthy regions"""
        healthy_regions = [r for r in self.regions.values() if r.status == "healthy"]
        
        if len(healthy_regions) < 2:
            return  # Not enough regions to sync
        
        logger.info("🔄 Syncing state across regions...")
        
        # Gather state from all regions
        remote_states = []
        for region in healthy_regions:
            try:
                state = await self._fetch_region_state(region)
                remote_states.append(state)
            except Exception as e:
                logger.warning(f"⚠️ Failed to fetch state from {region.id}: {e}")
        
        # Merge all states
        merged = self.global_state
        for state in remote_states:
            merged = merged.merge(state)
        
        self.global_state = merged
        
        # Push merged state to all regions
        for region in healthy_regions:
            try:
                await self._push_state_to_region(region, merged)
            except Exception as e:
                logger.warning(f"⚠️ Failed to push state to {region.id}: {e}")
        
        logger.info(f"✅ State synced: {len(merged.state)} keys")
    
    async def _fetch_region_state(self, region: Region) -> CRDTState:
        """Fetch state from a region"""
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{region.endpoint}/state") as response:
                data = await response.json()
                
                state = CRDTState()
                state.state = data.get('state', {})
                state.vector_clock = data.get('vector_clock', {})
                # Parse timestamps
                for k, v in data.get('timestamps', {}).items():
                    state.timestamps[k] = datetime.fromisoformat(v)
                
                return state
    
    async def _push_state_to_region(self, region: Region, state: CRDTState):
        """Push state to a region"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{region.endpoint}/state",
                json=state.to_dict()
            ) as response:
                if response.status != 200:
                    raise Exception(f"HTTP {response.status}")
    
    async def _failover_monitor(self):
        """Monitor for failovers and rebalance"""
        while True:
            await asyncio.sleep(10)
            await self._check_failovers()
    
    async def _check_failovers(self):
        """Check if any regions need failover"""
        offline_regions = [r for r in self.regions.values() if r.status == "offline"]
        healthy_regions = [r for r in self.regions.values() if r.status == "healthy"]
        
        if not offline_regions:
            return
        
        logger.warning(f"🚨 Failover needed for: {[r.id for r in offline_regions]}")
        
        # Redistribute tasks from offline regions
        for offline in offline_regions:
            await self._redistribute_tasks(offline, healthy_regions)
    
    async def _redistribute_tasks(self, from_region: Region, to_regions: List[Region]):
        """Redistribute tasks from failed region to healthy ones"""
        if not to_regions:
            logger.error(f"❌ No healthy regions to failover to!")
            return
        
        logger.info(f"🔄 Redistributing tasks from {from_region.id}...")
        
        # In production, this would fetch active tasks from the failed region
        # and redistribute them
        
        # Update routing table
        for task_id, task in self.active_tasks.items():
            if from_region.id in task.preferred_regions:
                # Pick least loaded healthy region
                target = min(to_regions, key=lambda r: r.load_factor)
                task.preferred_regions = [target.id]
                
                logger.info(f"   Task {task_id} -> {target.id}")
    
    def get_best_region(self, task: GlobalTask) -> Optional[Region]:
        """Get best region for a task based on latency and load"""
        candidates = []
        
        for region_id in task.preferred_regions or self.regions.keys():
            region = self.regions.get(region_id)
            if region and region.status == "healthy":
                # Score: lower is better
                score = region.latency_ms * 0.5 + region.load_factor * 1000 * 0.5
                candidates.append((region, score))
        
        if not candidates:
            # Fallback to any healthy region
            healthy = [r for r in self.regions.values() if r.status == "healthy"]
            if healthy:
                return min(healthy, key=lambda r: r.load_factor)
            return None
        
        return min(candidates, key=lambda x: x[1])[0]
    
    async def distribute_task(self, task: GlobalTask) -> Dict[str, Any]:
        """Distribute a task to appropriate region(s)"""
        task_id = task.id or self._generate_task_id(task)
        task.id = task_id
        self.active_tasks[task_id] = task
        
        results = {}
        
        # Handle required regions (must run everywhere specified)
        if task.required_regions:
            for region_id in task.required_regions:
                region = self.regions.get(region_id)
                if region and region.status == "healthy":
                    result = await self._send_task_to_region(task, region)
                    results[region_id] = result
                else:
                    results[region_id] = {"error": "Region unavailable"}
        else:
            # Pick best region
            region = self.get_best_region(task)
            if region:
                result = await self._send_task_to_region(task, region)
                results[region.id] = result
            else:
                return {"error": "No healthy regions available"}
        
        return {
            "task_id": task_id,
            "distributed_to": list(results.keys()),
            "results": results
        }
    
    async def _send_task_to_region(self, task: GlobalTask, region: Region) -> Dict:
        """Send task to specific region"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{region.endpoint}/tasks",
                    json={
                        'id': task.id,
                        'type': task.type,
                        'payload': task.payload,
                        'priority': task.priority
                    }
                ) as response:
                    return await response.json()
        except Exception as e:
            logger.error(f"❌ Failed to send task to {region.id}: {e}")
            return {"error": str(e)}
    
    def _generate_task_id(self, task: GlobalTask) -> str:
        """Generate unique task ID"""
        data = f"{task.type}:{json.dumps(task.payload, sort_keys=True)}:{datetime.utcnow().isoformat()}"
        return hashlib.sha256(data.encode()).hexdigest()[:16]
    
    def get_global_status(self) -> Dict[str, Any]:
        """Get global orchestrator status"""
        return {
            "regions": {rid: r.to_dict() for rid, r in self.regions.items()},
            "active_tasks": len(self.active_tasks),
            "global_state_keys": len(self.global_state.state),
            "primary_region": self.primary_region,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    async def emergency_failover(self, region_id: str):
        """Manual emergency failover"""
        region = self.regions.get(region_id)
        if region:
            logger.warning(f"🚨 EMERGENCY FAILOVER: {region_id}")
            region.status = "offline"
            healthy = [r for r in self.regions.values() if r.status == "healthy"]
            await self._redistribute_tasks(region, healthy)


class GlobalLoadBalancer:
    """
    Latency-based global load balancer
    """
    
    def __init__(self, orchestrator: MultiRegionOrchestrator):
        self.orchestrator = orchestrator
        self.latency_history: Dict[str, List[float]] = {}
    
    def record_latency(self, region_id: str, latency_ms: float):
        """Record latency measurement"""
        if region_id not in self.latency_history:
            self.latency_history[region_id] = []
        
        self.latency_history[region_id].append(latency_ms)
        
        # Keep last 100 measurements
        if len(self.latency_history[region_id]) > 100:
            self.latency_history[region_id] = self.latency_history[region_id][-100:]
    
    def get_weighted_latency(self, region_id: str) -> float:
        """Get weighted average latency (recent measurements weighted more)"""
        history = self.latency_history.get(region_id, [])
        if not history:
            return float('inf')
        
        # Exponential weighting
        weights = [0.95 ** i for i in range(len(history))]
        weights.reverse()  # Most recent = highest weight
        
        weighted_sum = sum(l * w for l, w in zip(history, weights))
        weight_sum = sum(weights)
        
        return weighted_sum / weight_sum
    
    def get_best_region(self, exclude: List[str] = None) -> Optional[str]:
        """Get best region based on weighted latency"""
        exclude = exclude or []
        
        candidates = [
            rid for rid in self.orchestrator.regions.keys()
            if rid not in exclude and self.orchestrator.regions[rid].status == "healthy"
        ]
        
        if not candidates:
            return None
        
        return min(candidates, key=lambda r: self.get_weighted_latency(r))


# CLI interface
if __name__ == "__main__":
    import sys
    
    async def main():
        orchestrator = MultiRegionOrchestrator()
        
        if len(sys.argv) > 1:
            command = sys.argv[1]
            
            if command == "status":
                # Quick status check
                await orchestrator._check_all_regions()
                status = orchestrator.get_global_status()
                print(json.dumps(status, indent=2))
            
            elif command == "failover":
                region_id = sys.argv[2] if len(sys.argv) > 2 else None
                if region_id:
                    await orchestrator.emergency_failover(region_id)
                else:
                    print("Usage: python orchestrator.py failover <region_id>")
            
            else:
                print(f"Unknown command: {command}")
        
        else:
            # Start orchestrator
            await orchestrator.start()
    
    asyncio.run(main())
