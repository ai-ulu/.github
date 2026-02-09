"""
Claude Brain: AI-ULU'nun düşünce merkezi
"""

import os
import json
from anthropic import Anthropic
from typing import Dict, Any, Optional


class ClaudeBrain:
    """
    Claude LLM entegrasyonu.
    Hata analizi, öneriler ve stratejik kararlar.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        api_key = api_key or os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY required")
        
        self.client = Anthropic(api_key=api_key)
        self.model = "claude-3-5-sonnet-20241022"
    
    def analyze_error(self, error_log: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Hatayı analiz et ve çözüm öner.
        
        Example:
            analysis = brain.analyze_error(
                error_log="FileNotFoundError: metrics.json not found",
                context={"repo": "ai-ulu", "agent": "repair_agent"}
            )
        """
        prompt = f"""
        You are an expert DevOps AI analyzing system errors.
        
        Error Log:
        ```
        {error_log}
        ```
        
        Context:
        - Repository: {context.get('repo', 'unknown')}
        - Agent: {context.get('agent', 'unknown')}
        - Timestamp: {context.get('timestamp', 'unknown')}
        
        Analyze this error and provide:
        1. Root cause (be specific)
        2. Suggested fix (code snippet if applicable)
        3. Confidence level (0.0-1.0)
        4. Whether this can be auto-applied
        
        Respond in JSON format:
        {{
            "root_cause": "...",
            "suggested_fix": "...",
            "code_patch": "...",
            "confidence": 0.95,
            "auto_apply": true,
            "explanation": "..."
        }}
        """
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            # JSON parse
            result = json.loads(response.content[0].text)
            return result
            
        except json.JSONDecodeError:
            # Fallback
            return {
                "root_cause": "Could not parse LLM response",
                "suggested_fix": response.content[0].text if 'response' in locals() else "N/A",
                "confidence": 0.5,
                "auto_apply": False
            }
        except Exception as e:
            return {
                "root_cause": f"LLM error: {str(e)}",
                "suggested_fix": "Manual review required",
                "confidence": 0.0,
                "auto_apply": False
            }
    
    def suggest_strategic_decision(self, kingdom_map: Dict, metrics: Dict) -> Dict[str, Any]:
        """
        Stratejik karar öner.
        
        GodFather'a: "Şimdi ne yapsam?" diye sorduğunda bu çalışır.
        """
        prompt = f"""
        You are the strategic advisor for an autonomous AI engineering ecosystem.
        
        Current Kingdom Map:
        {json.dumps(kingdom_map, indent=2)}
        
        Current Metrics:
        {json.dumps(metrics, indent=2)}
        
        Based on this state, suggest the next strategic decision.
        Consider:
        - Resource allocation
        - Risk management
        - Growth opportunities
        
        Respond in JSON:
        {{
            "decision_type": "repo_classification|agent_policy|chaos_scenario",
            "target": "...",
            "action": "...",
            "reasoning": "...",
            "expected_outcome": "...",
            "priority": "high|medium|low"
        }}
        """
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            return json.loads(response.content[0].text)
            
        except Exception as e:
            return {
                "decision_type": "agent_policy",
                "target": "system",
                "action": "review_metrics",
                "reasoning": f"LLM error: {str(e)}",
                "priority": "low"
            }
    
    def parse_natural_language_command(self, command: str) -> Dict[str, Any]:
        """
        Doğal dil komutunu parse et.
        
        Example:
            "tüm muscle repolara chaos testi yap"
            -> {"action": "chaos_scenario", "target": "muscle", "scope": "all"}
        """
        prompt = f"""
        Parse this natural language command for an AI engineering system:
        
        Command: "{command}"
        
        Available actions:
        - chaos_scenario: Run chaos engineering test
        - status_check: Get status of repositories
        - repo_classify: Classify repositories
        - agent_deploy: Deploy/update agents
        
        Respond in JSON:
        {{
            "action": "...",
            "target": "...",
            "parameters": {{}},
            "confidence": 0.95
        }}
        """
        
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )
            
            return json.loads(response.content[0].text)
            
        except Exception as e:
            return {
                "action": "unknown",
                "target": "system",
                "confidence": 0.0,
                "error": str(e)
            }


# Singleton instance
_brain = None

def get_brain() -> ClaudeBrain:
    """Global brain instance"""
    global _brain
    if _brain is None:
        _brain = ClaudeBrain()
    return _brain


# Kullanım
if __name__ == '__main__':
    # Test
    brain = ClaudeBrain()
    
    analysis = brain.analyze_error(
        "MemoryError: Unable to allocate 2GB",
        {"repo": "ai-ulu", "agent": "repair_agent"}
    )
    
    print(json.dumps(analysis, indent=2))
