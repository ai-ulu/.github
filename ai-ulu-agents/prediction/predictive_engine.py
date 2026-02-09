"""
AI-ULU Predictive Engine (Phase 6)
ML-based failure prediction and auto-remediation
"""

import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pathlib import Path
import logging
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
import joblib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PredictiveEngine:
    """
    Machine Learning engine for predicting failures before they happen.
    
    Features:
    - Failure probability prediction (24h ahead)
    - Auto-remediation triggers
    - RSI trend forecasting
    """
    
    def __init__(self, model_dir: str = "ai-ulu-agents/prediction/models"):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        
        self.failure_classifier = None
        self.mttr_regressor = None
        self.scaler = StandardScaler()
        
        self._load_or_init_models()
    
    def _load_or_init_models(self):
        """Load existing models or initialize new ones"""
        failure_model_path = self.model_dir / "failure_classifier.pkl"
        mttr_model_path = self.model_dir / "mttr_regressor.pkl"
        scaler_path = self.model_dir / "scaler.pkl"
        
        if failure_model_path.exists():
            self.failure_classifier = joblib.load(failure_model_path)
            logger.info("✅ Loaded failure prediction model")
        else:
            self.failure_classifier = RandomForestClassifier(
                n_estimators=100,
                max_depth=10,
                random_state=42
            )
            logger.info("🆕 Initialized new failure classifier")
        
        if mttr_model_path.exists():
            self.mttr_regressor = joblib.load(mttr_model_path)
            logger.info("✅ Loaded MTTR prediction model")
        else:
            self.mttr_regressor = GradientBoostingRegressor(
                n_estimators=100,
                max_depth=5,
                random_state=42
            )
            logger.info("🆕 Initialized new MTTR regressor")
        
        if scaler_path.exists():
            self.scaler = joblib.load(scaler_path)
    
    def extract_features(self, repo: str, internal_memory: Dict, vault: Dict) -> Dict[str, float]:
        """
        Extract ML features from system state
        
        Returns feature dict for prediction
        """
        now = datetime.utcnow()
        
        # RSI features
        rsi_history = internal_memory.get("rsi_history", [])
        rsi_trend = self._calculate_trend(rsi_history)
        rsi_current = rsi_history[-1] if rsi_history else 98.0
        rsi_volatility = np.std(rsi_history[-20:]) if len(rsi_history) >= 20 else 0.0
        
        # Repair features
        repair_times = internal_memory.get("repair_times", [])
        avg_mttr = np.mean(repair_times[-30:]) if repair_times else 4.0
        mttr_trend = self._calculate_trend(repair_times[-10:])
        repair_frequency = len(repair_times) / max(len(rsi_history), 1)
        
        # Chaos features
        chaos_success = internal_memory.get("chaos_success_rate", 1.0)
        total_chaos = internal_memory.get("total_chaos_tests", 0)
        
        # Repo features from vault
        kingdom_map = vault.get("kingdom_map", {})
        repo_data = kingdom_map.get(repo, {})
        
        repo_classification = repo_data.get("classification", "muscle")
        classification_score = {"unicorn": 3, "muscle": 2, "archive": 1}.get(repo_classification, 1)
        
        # Activity features
        recent_decisions = vault.get("recent_decisions", [])
        decision_frequency = len([d for d in recent_decisions 
                                  if datetime.fromisoformat(d.get("timestamp", "2000-01-01")) > now - timedelta(hours=24)])
        
        features = {
            # RSI metrics
            "rsi_current": rsi_current,
            "rsi_trend": rsi_trend,
            "rsi_volatility": rsi_volatility,
            
            # Repair metrics
            "avg_mttr": avg_mttr,
            "mttr_trend": mttr_trend,
            "repair_frequency": repair_frequency,
            
            # Chaos metrics
            "chaos_success_rate": chaos_success,
            "total_chaos_tests": total_chaos,
            
            # Repo characteristics
            "repo_classification": classification_score,
            "decision_frequency": decision_frequency,
            
            # Time features
            "hour_of_day": now.hour,
            "day_of_week": now.weekday(),
        }
        
        return features
    
    def _calculate_trend(self, values: List[float]) -> float:
        """Calculate trend slope from time series"""
        if len(values) < 2:
            return 0.0
        
        x = np.arange(len(values))
        y = np.array(values)
        
        # Simple linear regression slope
        slope = np.polyfit(x, y, 1)[0] if len(values) > 1 else 0.0
        return slope
    
    def predict_failure_probability(self, repo: str, internal_memory: Dict, vault: Dict, hours_ahead: int = 24) -> Dict[str, Any]:
        """
        Predict probability of failure in the next N hours
        
        Returns:
            {
                "probability": 0.73,
                "confidence": 0.85,
                "risk_level": "high",  # low/medium/high/critical
                "factors": [...],
                "recommended_action": "proactive_maintenance"
            }
        """
        features = self.extract_features(repo, internal_memory, vault)
        feature_vector = np.array([[v for v in features.values()]])
        
        # Check if model is trained
        if not hasattr(self.failure_classifier, 'classes_'):
            # Model not trained yet, use heuristic
            probability = self._heuristic_failure_prediction(features)
            confidence = 0.5
        else:
            # Use trained model
            feature_vector_scaled = self.scaler.transform(feature_vector)
            probability = self.failure_classifier.predict_proba(feature_vector_scaled)[0][1]
            confidence = self._estimate_confidence(features)
        
        # Determine risk level
        if probability >= 0.8:
            risk_level = "critical"
        elif probability >= 0.6:
            risk_level = "high"
        elif probability >= 0.3:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Identify contributing factors
        factors = self._identify_risk_factors(features)
        
        # Recommend action
        recommended_action = self._recommend_action(risk_level, factors)
        
        prediction = {
            "repo": repo,
            "probability": float(probability),
            "confidence": float(confidence),
            "risk_level": risk_level,
            "prediction_horizon_hours": hours_ahead,
            "factors": factors,
            "recommended_action": recommended_action,
            "timestamp": datetime.utcnow().isoformat(),
            "features": features
        }
        
        logger.info(f"🔮 {repo}: {risk_level.upper()} risk ({probability:.1%} failure probability)")
        
        return prediction
    
    def _heuristic_failure_prediction(self, features: Dict[str, float]) -> float:
        """Heuristic prediction when ML model is not trained"""
        score = 0.0
        
        # RSI based
        rsi = features.get("rsi_current", 98.0)
        if rsi < 70:
            score += 0.4
        elif rsi < 85:
            score += 0.2
        
        # MTTR trend
        if features.get("mttr_trend", 0) > 0:
            score += 0.2
        
        # Chaos success
        if features.get("chaos_success_rate", 1.0) < 0.7:
            score += 0.2
        
        # Repair frequency
        if features.get("repair_frequency", 0) > 0.1:
            score += 0.2
        
        return min(score, 1.0)
    
    def _estimate_confidence(self, features: Dict[str, float]) -> float:
        """Estimate prediction confidence based on data quality"""
        confidence = 0.5
        
        # More data = higher confidence
        if features.get("total_chaos_tests", 0) > 50:
            confidence += 0.2
        if features.get("repair_frequency", 0) > 0:
            confidence += 0.15
        
        # Stable RSI = higher confidence
        if features.get("rsi_volatility", 1.0) < 5:
            confidence += 0.15
        
        return min(confidence, 0.95)
    
    def _identify_risk_factors(self, features: Dict[str, float]) -> List[str]:
        """Identify which factors contribute to risk"""
        factors = []
        
        if features.get("rsi_current", 98.0) < 80:
            factors.append("Low RSI (instability detected)")
        
        if features.get("rsi_trend", 0) < -0.5:
            factors.append("Declining RSI trend")
        
        if features.get("mttr_trend", 0) > 0.5:
            factors.append("Increasing repair times")
        
        if features.get("chaos_success_rate", 1.0) < 0.8:
            factors.append("Poor chaos test performance")
        
        if features.get("decision_frequency", 0) > 5:
            factors.append("High decision frequency (unstable)")
        
        return factors
    
    def _recommend_action(self, risk_level: str, factors: List[str]) -> str:
        """Recommend action based on risk"""
        actions = {
            "critical": "immediate_proactive_maintenance",
            "high": "schedule_maintenance",
            "medium": "increase_monitoring",
            "low": "continue_normal_ops"
        }
        return actions.get(risk_level, "monitor")
    
    def predict_mttr(self, repo: str, issue_type: str, features: Dict) -> Dict[str, Any]:
        """Predict Mean Time To Repair for a specific issue"""
        # Simplified MTTR prediction
        base_mttr = 4.0  # minutes
        
        # Adjust based on features
        if features.get("repo_classification") == 3:  # unicorn
            base_mttr *= 0.8  # Faster for critical repos
        
        if issue_type == "dependency":
            base_mttr *= 1.2
        elif issue_type == "test_failure":
            base_mttr *= 0.8
        
        return {
            "predicted_mttr_minutes": base_mttr,
            "confidence": 0.75,
            "issue_type": issue_type,
            "repo": repo
        }
    
    def train(self, historical_data: List[Dict]):
        """Train models on historical failure data"""
        if len(historical_data) < 10:
            logger.warning("⚠️ Not enough data to train models (need 10+ samples)")
            return
        
        logger.info(f"🧠 Training models with {len(historical_data)} samples...")
        
        # Prepare training data
        X = []
        y_failure = []
        y_mttr = []
        
        for record in historical_data:
            features = record.get("features", {})
            X.append([v for v in features.values()])
            y_failure.append(1 if record.get("failure_occurred") else 0)
            y_mttr.append(record.get("mttr_minutes", 4.0))
        
        X = np.array(X)
        y_failure = np.array(y_failure)
        y_mttr = np.array(y_mttr)
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X)
        
        # Train models
        self.failure_classifier.fit(X_scaled, y_failure)
        self.mttr_regressor.fit(X_scaled, y_mttr)
        
        # Save models
        joblib.dump(self.failure_classifier, self.model_dir / "failure_classifier.pkl")
        joblib.dump(self.mttr_regressor, self.model_dir / "mttr_regressor.pkl")
        joblib.dump(self.scaler, self.model_dir / "scaler.pkl")
        
        logger.info("✅ Models trained and saved")
    
    async def run_continuous_prediction(self, check_interval_minutes: int = 30):
        """Continuously run predictions for all repos"""
        logger.info(f"🔮 Continuous prediction started (interval: {check_interval_minutes}m)")
        
        while True:
            try:
                # Load current state
                from ai_ulu_agents.agents.core.memory_v2 import UnifiedMemory
                memory = UnifiedMemory()
                
                vault = memory.vault.load()
                kingdom_map = vault.get("kingdom_map", {})
                
                predictions = []
                for repo in kingdom_map.keys():
                    internal = memory.internal.load(repo)
                    prediction = self.predict_failure_probability(repo, internal, vault)
                    predictions.append(prediction)
                    
                    # Trigger auto-remediation if critical
                    if prediction["risk_level"] == "critical":
                        await self._trigger_auto_remediation(repo, prediction)
                
                # Save predictions
                predictions_path = self.model_dir / "latest_predictions.json"
                with open(predictions_path, "w") as f:
                    json.dump(predictions, f, indent=2)
                
                logger.info(f"📊 Predictions updated for {len(predictions)} repos")
                
            except Exception as e:
                logger.error(f"❌ Prediction error: {e}")
            
            await asyncio.sleep(check_interval_minutes * 60)
    
    async def _trigger_auto_remediation(self, repo: str, prediction: Dict):
        """Trigger proactive maintenance for critical predictions"""
        logger.warning(f"🚨 CRITICAL: Triggering auto-remediation for {repo}")
        
        # This would integrate with the orchestrator
        remediation = {
            "type": "proactive_maintenance",
            "repo": repo,
            "reason": prediction,
            "timestamp": datetime.utcnow().isoformat(),
            "actions": [
                "increase_monitoring_frequency",
                "prepare_rollback",
                "notify_team"
            ]
        }
        
        # Save remediation plan
        remediations_path = self.model_dir / "pending_remediations.json"
        remediations = []
        if remediations_path.exists():
            with open(remediations_path) as f:
                remediations = json.load(f)
        
        remediations.append(remediation)
        
        with open(remediations_path, "w") as f:
            json.dump(remediations, f, indent=2)
        
        # TODO: Notify via WebSocket
        logger.info(f"✅ Remediation plan created for {repo}")


class AutoRemediation:
    """
    Executes remediation actions based on predictions
    """
    
    def __init__(self):
        self.actions = {
            "increase_monitoring_frequency": self._increase_monitoring,
            "prepare_rollback": self._prepare_rollback,
            "notify_team": self._notify_team,
            "run_chaos_test": self._run_chaos_test,
            "scale_resources": self._scale_resources
        }
    
    async def execute(self, action: str, params: Dict):
        """Execute a remediation action"""
        if action in self.actions:
            return await self.actions[action](params)
        else:
            logger.warning(f"⚠️ Unknown remediation action: {action}")
            return False
    
    async def _increase_monitoring(self, params: Dict):
        """Increase monitoring frequency for a repo"""
        logger.info(f"🔍 Increasing monitoring for {params.get('repo')}")
        return True
    
    async def _prepare_rollback(self, params: Dict):
        """Prepare rollback artifacts"""
        logger.info(f"⏮️ Preparing rollback for {params.get('repo')}")
        return True
    
    async def _notify_team(self, params: Dict):
        """Send notification to team"""
        logger.info(f"📢 Notifying team about {params.get('repo')}")
        return True
    
    async def _run_chaos_test(self, params: Dict):
        """Trigger chaos test"""
        logger.info(f"🐒 Running chaos test on {params.get('repo')}")
        return True
    
    async def _scale_resources(self, params: Dict):
        """Scale resources up/down"""
        logger.info(f"⚡ Scaling resources for {params.get('repo')}")
        return True


# CLI interface
if __name__ == "__main__":
    import sys
    
    engine = PredictiveEngine()
    
    if len(sys.argv) > 1 and sys.argv[1] == "predict":
        # Single prediction
        from ai_ulu_agents.agents.core.memory_v2 import UnifiedMemory
        memory = UnifiedMemory()
        vault = memory.vault.load()
        
        for repo in vault.get("kingdom_map", {}).keys():
            internal = memory.internal.load(repo)
            pred = engine.predict_failure_probability(repo, internal, vault)
            print(f"\n{repo}:")
            print(f"  Risk: {pred['risk_level'].upper()} ({pred['probability']:.1%})")
            print(f"  Factors: {', '.join(pred['factors']) if pred['factors'] else 'None'}")
            print(f"  Action: {pred['recommended_action']}")
    
    else:
        # Run continuous prediction
        asyncio.run(engine.run_continuous_prediction())
