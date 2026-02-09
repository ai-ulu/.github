"""
AI-ULU Auto-Fix Agent (Phase 7)
Automatically fixes errors and creates PRs
"""

import os
import json
import asyncio
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path
import logging
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GitHubAPI:
    """GitHub API wrapper for auto-fix operations"""
    
    def __init__(self, token: Optional[str] = None):
        self.token = token or os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }
    
    async def _request(self, method: str, endpoint: str, data: Dict = None) -> Dict:
        """Make GitHub API request"""
        url = f"{self.base_url}{endpoint}"
        
        async with aiohttp.ClientSession() as session:
            async with session.request(
                method, 
                url, 
                headers=self.headers,
                json=data
            ) as response:
                if response.status >= 400:
                    text = await response.text()
                    raise Exception(f"GitHub API error {response.status}: {text}")
                
                return await response.json()
    
    async def create_branch(self, repo: str, base_branch: str, new_branch: str) -> str:
        """Create a new branch from base"""
        # Get base branch SHA
        base_data = await self._request("GET", f"/repos/{repo}/git/refs/heads/{base_branch}")
        base_sha = base_data["object"]["sha"]
        
        # Create new branch
        await self._request("POST", f"/repos/{repo}/git/refs", {
            "ref": f"refs/heads/{new_branch}",
            "sha": base_sha
        })
        
        logger.info(f"✅ Created branch: {new_branch}")
        return new_branch
    
    async def get_file_content(self, repo: str, path: str, branch: str = "main") -> str:
        """Get file content from repo"""
        data = await self._request("GET", f"/repos/{repo}/contents/{path}?ref={branch}")
        import base64
        return base64.b64decode(data["content"]).decode("utf-8")
    
    async def update_file(self, repo: str, path: str, content: str, message: str, branch: str, sha: str = None):
        """Update or create file"""
        import base64
        
        if not sha:
            try:
                existing = await self._request("GET", f"/repos/{repo}/contents/{path}?ref={branch}")
                sha = existing["sha"]
            except:
                sha = None
        
        data = {
            "message": message,
            "content": base64.b64encode(content.encode()).decode(),
            "branch": branch
        }
        if sha:
            data["sha"] = sha
        
        await self._request("PUT", f"/repos/{repo}/contents/{path}", data)
        logger.info(f"✅ Updated file: {path}")
    
    async def create_pr(self, repo: str, title: str, body: str, head: str, base: str = "main") -> Dict:
        """Create pull request"""
        pr_data = await self._request("POST", f"/repos/{repo}/pulls", {
            "title": title,
            "body": body,
            "head": head,
            "base": base
        })
        
        logger.info(f"✅ Created PR: {pr_data['html_url']}")
        return pr_data
    
    async def request_review(self, repo: str, pr_number: int, reviewers: List[str]):
        """Request PR review"""
        await self._request("POST", f"/repos/{repo}/pulls/{pr_number}/requested_reviewers", {
            "reviewers": reviewers
        })
    
    async def add_labels(self, repo: str, pr_number: int, labels: List[str]):
        """Add labels to PR"""
        await self._request("POST", f"/repos/{repo}/issues/{pr_number}/labels", {
            "labels": labels
        })


class AutoFixAgent:
    """
    Autonomous agent that fixes errors and creates PRs.
    
    Flow:
    1. Detect error (from WebSocket or polling)
    2. Analyze with LLM (root cause + fix)
    3. Create branch with fix
    4. Open PR with description
    5. Notify team
    """
    
    def __init__(self, github_token: Optional[str] = None):
        self.github = GitHubAPI(github_token)
        self.fixes_dir = Path("ai-ulu-agents/auto_fixes")
        self.fixes_dir.mkdir(parents=True, exist_ok=True)
    
    async def create_fix_pr(
        self,
        error: Dict[str, Any],
        repo: str,
        llm_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a PR with automated fix
        
        Args:
            error: Error details from agent
            repo: Target repo (e.g., "ai-ulu/core")
            llm_analysis: LLM analysis with fix suggestion
        
        Returns:
            PR details
        """
        error_id = error.get("error_id", f"err_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
        error_summary = llm_analysis.get("root_cause", "Unknown error")[:50]
        
        logger.info(f"🔧 Creating auto-fix PR for {repo}: {error_summary}")
        
        # Generate branch name
        safe_summary = re.sub(r'[^a-zA-Z0-9]', '-', error_summary.lower())[:30]
        branch_name = f"auto-fix/{error_id}-{safe_summary}"
        
        try:
            # 1. Create branch
            await self.github.create_branch(repo, "main", branch_name)
            
            # 2. Apply fix (if code patch provided)
            if "code_patch" in llm_analysis:
                await self._apply_code_patch(repo, branch_name, llm_analysis["code_patch"])
            
            # 3. Create PR
            pr_title = f"[AUTO-FIX] {error_summary}"
            pr_body = self._generate_pr_body(error, llm_analysis)
            
            pr = await self.github.create_pr(repo, pr_title, pr_body, branch_name)
            
            # 4. Add labels
            await self.github.add_labels(repo, pr["number"], ["auto-fix", "bot"])
            
            # 5. Save fix record
            fix_record = {
                "error_id": error_id,
                "repo": repo,
                "pr_url": pr["html_url"],
                "pr_number": pr["number"],
                "branch": branch_name,
                "analysis": llm_analysis,
                "timestamp": datetime.utcnow().isoformat(),
                "status": "pending_review"
            }
            
            self._save_fix_record(fix_record)
            
            # 6. Send notification
            await self._send_notification(fix_record)
            
            logger.info(f"✅ Auto-fix PR created: {pr['html_url']}")
            
            return {
                "success": True,
                "pr_url": pr["html_url"],
                "pr_number": pr["number"],
                "branch": branch_name
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to create auto-fix PR: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _apply_code_patch(self, repo: str, branch: str, patch: Dict[str, str]):
        """Apply code patch to repo"""
        for file_path, new_content in patch.items():
            # Get current file SHA if exists
            sha = None
            try:
                existing = await self.github._request(
                    "GET", 
                    f"/repos/{repo}/contents/{file_path}?ref={branch}"
                )
                sha = existing["sha"]
            except:
                pass  # File doesn't exist yet
            
            # Update file
            await self.github.update_file(
                repo=repo,
                path=file_path,
                content=new_content,
                message=f"[AUTO-FIX] Fix for {file_path}",
                branch=branch,
                sha=sha
            )
    
    def _generate_pr_body(self, error: Dict, analysis: Dict) -> str:
        """Generate PR description"""
        return f"""## 🤖 Automated Fix

This PR was automatically generated by AI-ULU Auto-Fix Agent.

### Error Details
- **Error ID:** {error.get('error_id', 'N/A')}
- **Agent:** {error.get('agent', 'Unknown')}
- **Timestamp:** {datetime.utcnow().isoformat()}

### Root Cause
{analysis.get('root_cause', 'Unknown')}

### Suggested Fix
{analysis.get('suggested_fix', 'No fix suggested')}

### Confidence
**{analysis.get('confidence', 0) * 100:.0f}%**

### Auto-Apply
{'✅ Yes' if analysis.get('auto_apply') else '❌ No - requires manual review'}

---
**Note:** This is an automated fix. Please review carefully before merging.

Generated by AI-ULU Auto-Fix Agent 🤖
"""
    
    def _save_fix_record(self, record: Dict):
        """Save fix record to disk"""
        record_path = self.fixes_dir / f"{record['error_id']}.json"
        with open(record_path, "w") as f:
            json.dump(record, f, indent=2)
    
    async def _send_notification(self, fix_record: Dict):
        """Send notification about new PR"""
        # TODO: Integrate with WebSocket for real-time notification
        logger.info(f"📢 Notification: New auto-fix PR {fix_record['pr_url']}")
        
        # Could also send to Discord/Slack
        webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
        if webhook_url:
            await self._send_discord_notification(webhook_url, fix_record)
    
    async def _send_discord_notification(self, webhook_url: str, fix_record: Dict):
        """Send Discord notification"""
        message = {
            "embeds": [{
                "title": "🤖 New Auto-Fix PR Created",
                "description": f"PR: {fix_record['pr_url']}",
                "color": 0x00ff88,
                "fields": [
                    {
                        "name": "Repository",
                        "value": fix_record['repo'],
                        "inline": True
                    },
                    {
                        "name": "Confidence",
                        "value": f"{fix_record['analysis'].get('confidence', 0) * 100:.0f}%",
                        "inline": True
                    }
                ],
                "timestamp": datetime.utcnow().isoformat()
            }]
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(webhook_url, json=message) as resp:
                if resp.status == 204:
                    logger.info("✅ Discord notification sent")
    
    async def handle_pr_merge(self, repo: str, pr_number: int):
        """Handle PR merge event"""
        # Update fix record
        for record_file in self.fixes_dir.glob("*.json"):
            with open(record_file) as f:
                record = json.load(f)
            
            if record.get("repo") == repo and record.get("pr_number") == pr_number:
                record["status"] = "merged"
                record["merged_at"] = datetime.utcnow().isoformat()
                
                with open(record_file, "w") as f:
                    json.dump(record, f, indent=2)
                
                logger.info(f"✅ PR #{pr_number} marked as merged")
                break
    
    async def get_pending_fixes(self) -> List[Dict]:
        """Get all pending auto-fix PRs"""
        pending = []
        for record_file in self.fixes_dir.glob("*.json"):
            with open(record_file) as f:
                record = json.load(f)
            
            if record.get("status") == "pending_review":
                pending.append(record)
        
        return pending


class AutoFixOrchestrator:
    """
    Orchestrates the auto-fix workflow:
    1. Listen for errors (WebSocket)
    2. Send to LLM for analysis
    3. If fix suggested, create PR
    """
    
    def __init__(self, github_token: Optional[str] = None):
        self.fix_agent = AutoFixAgent(github_token)
        self.llm = None  # Will be injected
    
    def set_llm(self, llm_client):
        """Set LLM client for analysis"""
        self.llm = llm_client
    
    async def on_error_detected(self, error_data: Dict):
        """Handle error detection"""
        logger.info(f"🔍 Analyzing error with LLM: {error_data.get('error_id')}")
        
        if not self.llm:
            logger.warning("⚠️ No LLM configured, skipping auto-fix")
            return
        
        # Get LLM analysis
        try:
            analysis = self.llm.analyze_error(
                error_data.get("error", ""),
                {
                    "repo": error_data.get("repo"),
                    "agent": error_data.get("agent"),
                    "timestamp": error_data.get("timestamp")
                }
            )
            
            # Check if we should auto-create PR
            confidence = analysis.get("confidence", 0)
            auto_apply = analysis.get("auto_apply", False)
            
            if confidence >= 0.8 and auto_apply:
                logger.info("🤖 Auto-creating fix PR (high confidence)")
                result = await self.fix_agent.create_fix_pr(
                    error_data,
                    error_data.get("repo", "ai-ulu/unknown"),
                    analysis
                )
                
                # Broadcast result via WebSocket
                await self._broadcast_fix_result(result)
            else:
                logger.info(f"⚠️ Low confidence ({confidence:.1%}) or auto_apply=false, skipping auto-fix")
        
        except Exception as e:
            logger.error(f"❌ Auto-fix error: {e}")
    
    async def _broadcast_fix_result(self, result: Dict):
        """Broadcast fix result to dashboards"""
        # This would integrate with WebSocket server
        pass


# Integration with Neural Link
class NeuralLinkAutoFix:
    """
    Integrates Auto-Fix with WebSocket Neural Link
    """
    
    def __init__(self, orchestrator: AutoFixOrchestrator):
        self.orchestrator = orchestrator
    
    async def handle_websocket_message(self, data: Dict):
        """Handle messages from WebSocket"""
        if data.get("event") == "agent.error":
            # Error detected, trigger auto-fix workflow
            await self.orchestrator.on_error_detected({
                "error_id": data.get("error_id"),
                "error": data.get("data", {}).get("error"),
                "agent": data.get("agent_id"),
                "repo": data.get("data", {}).get("repo", "ai-ulu/unknown"),
                "timestamp": data.get("timestamp")
            })


# CLI interface
if __name__ == "__main__":
    import sys
    
    async def main():
        agent = AutoFixAgent()
        
        if len(sys.argv) > 1 and sys.argv[1] == "list":
            # List pending fixes
            pending = await agent.get_pending_fixes()
            print(f"\n📋 Pending Auto-Fix PRs: {len(pending)}")
            for fix in pending:
                print(f"  - {fix['repo']}: {fix['pr_url']}")
        
        else:
            print("Usage: python auto_fix_agent.py [list]")
    
    asyncio.run(main())
