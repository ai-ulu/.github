"""
Unit tests for the Two-Tier Memory System

Run with: pytest tests/test_memory_v2.py -v
"""

import pytest
import json
import os
import tempfile
import shutil
from datetime import datetime, timedelta
from ai_ulu_agents.agents.core.memory_v2 import (
    InternalMemory, 
    TheVault, 
    UnifiedMemory,
    RepoClass,
    DecisionType,
    FileLock
)


class TestFileLock:
    """Test cross-platform file locking"""
    
    def test_lock_acquires_and_releases(self, tmp_path):
        """Test that lock can be acquired and released"""
        test_file = tmp_path / "test.json"
        
        with FileLock(str(test_file), timeout=1.0):
            # Lock should be held
            lock_file = str(test_file) + ".lock"
            assert os.path.exists(lock_file)
        
        # Lock should be released
        assert not os.path.exists(lock_file)
    
    def test_lock_prevents_concurrent_access(self, tmp_path):
        """Test that lock prevents concurrent access"""
        test_file = tmp_path / "test.json"
        
        with FileLock(str(test_file), timeout=1.0):
            # Try to acquire second lock (should timeout)
            with pytest.raises(TimeoutError):
                with FileLock(str(test_file), timeout=0.1):
                    pass


class TestInternalMemory:
    """Test Tier 1: Internal Memory"""
    
    @pytest.fixture
    def temp_memory(self, tmp_path):
        """Create temporary memory instance"""
        storage_path = tmp_path / "internal_memory.json"
        memory = InternalMemory(str(storage_path))
        return memory
    
    def test_initialization_creates_storage(self, tmp_path):
        """Test that initialization creates storage file"""
        storage_path = tmp_path / "internal_memory.json"
        memory = InternalMemory(str(storage_path))
        
        assert os.path.exists(storage_path)
        with open(storage_path) as f:
            data = json.load(f)
            assert data["version"] == "2.0"
            assert "rsi_history" in data
    
    def test_record_rsi(self, temp_memory):
        """Test RSI recording"""
        temp_memory.record_rsi(98.5)
        temp_memory.record_rsi(97.8)
        
        data = temp_memory._read()
        assert len(data["rsi_history"]) == 2
        assert data["rsi_history"][0]["value"] == 98.5
        assert data["rsi_history"][1]["value"] == 97.8
    
    def test_get_rsi_trend_with_data(self, temp_memory):
        """Test RSI trend analysis with data"""
        # Record RSI values
        temp_memory.record_rsi(98.0)
        temp_memory.record_rsi(97.0)
        temp_memory.record_rsi(96.0)
        
        trend = temp_memory.get_rsi_trend(hours=24)
        
        assert trend["trend"] == "declining"
        assert trend["avg"] == 97.0
        assert trend["min"] == 96.0
        assert trend["max"] == 98.0
        assert trend["count"] == 3
    
    def test_get_rsi_trend_no_data(self, temp_memory):
        """Test RSI trend with no data"""
        trend = temp_memory.get_rsi_trend(hours=24)
        
        assert trend["trend"] == "unknown"
        assert trend["avg"] == 0
    
    def test_claim_task_success(self, temp_memory):
        """Test successful task claim"""
        result = temp_memory.claim_task("repair_agent", "task_001")
        
        assert result is True
        
        data = temp_memory._read()
        assert "task_001" in data["agent_coordination"]["claimed_tasks"]
        assert data["agent_coordination"]["claimed_tasks"]["task_001"]["agent_id"] == "repair_agent"
    
    def test_claim_task_already_claimed(self, temp_memory):
        """Test claiming already claimed task"""
        temp_memory.claim_task("repair_agent", "task_001")
        result = temp_memory.claim_task("chaos_monkey", "task_001")
        
        assert result is False
    
    def test_release_task(self, temp_memory):
        """Test task release"""
        temp_memory.claim_task("repair_agent", "task_001")
        temp_memory.release_task("repair_agent", "task_001")
        
        data = temp_memory._read()
        assert "task_001" not in data["agent_coordination"]["claimed_tasks"]
    
    def test_rsi_history_limit(self, temp_memory):
        """Test that RSI history is limited to 1000 entries"""
        # Add more than 1000 entries
        for i in range(1005):
            temp_memory.record_rsi(float(i % 100))
        
        data = temp_memory._read()
        assert len(data["rsi_history"]) == 1000


class TestTheVault:
    """Test Tier 2: The Vault"""
    
    @pytest.fixture
    def temp_vault(self, tmp_path, monkeypatch):
        """Create temporary vault instance"""
        vault_path = tmp_path / "the_vault.json"
        monkeypatch.setattr(TheVault, "VAULT_PATH", str(vault_path))
        vault = TheVault()
        return vault
    
    def test_initialization_creates_vault(self, temp_vault, tmp_path, monkeypatch):
        """Test that initialization creates vault file"""
        vault_path = tmp_path / "the_vault.json"
        monkeypatch.setattr(TheVault, "VAULT_PATH", str(vault_path))
        vault = TheVault()
        
        assert os.path.exists(vault_path)
        with open(vault_path) as f:
            data = json.load(f)
            assert data["version"] == "1.0"
            assert "vision" in data
            assert "decisions" in data
    
    def test_assign_repo_role(self, temp_vault):
        """Test repository role assignment"""
        temp_vault.assign_repo_role(
            "TestRepo",
            RepoClass.UNICORN,
            assigned_by="test",
            commercial_potential=90,
            technical_maturity=85
        )
        
        role = temp_vault.get_repo_role("TestRepo")
        assert role is not None
        assert role["assigned_class"] == "unicorn"
        assert role["assigned_by"] == "test"
        assert role["commercial_potential"] == 90
    
    def test_record_decision(self, temp_vault):
        """Test strategic decision recording"""
        decision_id = temp_vault.record_decision(
            DecisionType.REPO_CLASSIFICATION,
            "TestRepo",
            "Classify as unicorn",
            "High commercial potential",
            "Better resource allocation"
        )
        
        assert decision_id.startswith("dec_")
        
        decisions = temp_vault.get_active_decisions()
        assert len(decisions) == 1
        assert decisions[0]["decision"] == "Classify as unicorn"
    
    def test_get_vision(self, temp_vault):
        """Test getting system vision"""
        vision = temp_vault.get_vision()
        
        assert vision.target_aor == 95.0
        assert vision.target_rsi == 99.0
        assert vision.target_mttr == 3.0
        assert len(vision.strategic_goals) > 0
    
    def test_update_vision(self, temp_vault):
        """Test updating system vision"""
        temp_vault.update_vision(target_aor=96.0)
        
        vision = temp_vault.get_vision()
        assert vision.target_aor == 96.0
        assert vision.target_rsi == 99.0  # Unchanged
    
    def test_revoke_decision(self, temp_vault):
        """Test decision revocation"""
        decision_id = temp_vault.record_decision(
            DecisionType.AGENT_POLICY,
            "system",
            "Test policy",
            "Test reasoning",
            "Test outcome"
        )
        
        result = temp_vault.revoke_decision(decision_id, "Policy changed")
        assert result is True
        
        decisions = temp_vault.get_active_decisions()
        assert len(decisions) == 0
    
    def test_get_kingdom_map(self, temp_vault):
        """Test kingdom map generation"""
        temp_vault.assign_repo_role("Repo1", RepoClass.UNICORN)
        temp_vault.assign_repo_role("Repo2", RepoClass.MUSCLE)
        temp_vault.assign_repo_role("Repo3", RepoClass.ARCHIVE)
        
        kingdom = temp_vault.get_kingdom_map()
        
        assert "Repo1" in kingdom["unicorn"]
        assert "Repo2" in kingdom["muscle"]
        assert "Repo3" in kingdom["archive"]
        assert ".github" in kingdom["godfather"]
    
    def test_decisions_filtered_by_type(self, temp_vault):
        """Test filtering decisions by type"""
        temp_vault.record_decision(
            DecisionType.CHAOS_SCENARIO,
            "*",
            "Enable chaos",
            "Test",
            "Outcome"
        )
        temp_vault.record_decision(
            DecisionType.AGENT_POLICY,
            "system",
            "Policy",
            "Test",
            "Outcome"
        )
        
        chaos_decisions = temp_vault.get_active_decisions(DecisionType.CHAOS_SCENARIO)
        assert len(chaos_decisions) == 1


class TestUnifiedMemory:
    """Test Unified Memory interface"""
    
    @pytest.fixture
    def unified_memory(self, tmp_path, monkeypatch):
        """Create temporary unified memory"""
        internal_path = tmp_path / "internal_memory.json"
        vault_path = tmp_path / "the_vault.json"
        
        monkeypatch.setattr(TheVault, "VAULT_PATH", str(vault_path))
        
        memory = UnifiedMemory()
        memory.internal.storage_path = str(internal_path)
        memory.internal._ensure_storage()
        
        return memory
    
    def test_sync_metrics(self, unified_memory):
        """Test metrics synchronization between tiers"""
        # Record some RSI data
        unified_memory.internal.record_rsi(98.0)
        unified_memory.internal.record_rsi(97.0)
        
        sync = unified_memory.sync_metrics()
        
        assert "current_rsi_trend" in sync
        assert "target_aor" in sync
        assert "gap_analysis" in sync
        assert "aor_gap" in sync["gap_analysis"]
        assert "rsi_gap" in sync["gap_analysis"]


class TestBackwardCompatibility:
    """Test backward compatibility with AgentMemory v1"""
    
    def test_agent_memory_is_internal_memory(self, tmp_path):
        """Test that AgentMemory is now InternalMemory"""
        from ai_ulu_agents.agents.core.memory_v2 import AgentMemory
        
        storage_path = tmp_path / "memory.json"
        memory = AgentMemory(str(storage_path))
        
        # Should have InternalMemory methods
        assert hasattr(memory, "record_rsi")
        assert hasattr(memory, "claim_task")
        assert hasattr(memory, "get_rsi_trend")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
