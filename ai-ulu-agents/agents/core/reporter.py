import json
import os
import urllib.request
from datetime import datetime


class IssueReporter:
    def __init__(self, repo: str, token: str):
        self.repo = repo
        self.token = token

    def create_issue(self, title: str, body: str) -> None:
        url = f"https://api.github.com/repos/{self.repo}/issues"
        payload = json.dumps({"title": title, "body": body}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"token {self.token}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            response.read()


def maybe_report_issue(agent: str, reason: str) -> None:
    enabled = os.getenv("REPORT_ISSUES", "0") == "1"
    repo = os.getenv("REPORT_REPO", "")
    token = os.getenv("GITHUB_TOKEN", "")
    lang = os.getenv("REPORT_LANG", "tr").lower()
    if not enabled or not repo or not token:
        return

    if lang == "tr":
        title = f"[OTONOM-HATA] - CI Hatti Arizasi: {agent}"
        body = (
            "Sistem bir ariza tespit etti. RSI degeri dustu. "
            "Self-Healing sureci baslatildi.\\n\\n"
            f"Ajan: {agent}\\n"
            f"Neden: {reason}\\n"
            f"Zaman: {datetime.utcnow().isoformat()}Z"
        )
    else:
        title = f"[AUTONOM-ERROR] - CI Failure: {agent}"
        body = (
            "The system detected a failure. RSI dropped. "
            "Self-healing has started.\\n\\n"
            f"Agent: {agent}\\n"
            f"Reason: {reason}\\n"
            f"Time: {datetime.utcnow().isoformat()}Z"
        )

    IssueReporter(repo, token).create_issue(title, body)
