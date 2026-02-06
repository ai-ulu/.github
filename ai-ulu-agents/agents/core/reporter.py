import json
import os
import urllib.request
from datetime import datetime
from typing import Optional


class IssueReporter:
    def __init__(self, repo: str, token: str):
        self.repo = repo
        self.token = token

    def create_issue(self, title: str, body: str) -> Optional[int]:
        url = f"https://api.github.com/repos/{self.repo}/issues"
        payload = json.dumps({"title": title, "body": body}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"token {self.token}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
            return int(data.get("number", 0)) if data.get("number") else None
        return None

    def add_comment(self, issue_number: int, body: str) -> None:
        url = f"https://api.github.com/repos/{self.repo}/issues/{issue_number}/comments"
        payload = json.dumps({"body": body}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Authorization", f"token {self.token}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            response.read()

    def close_issue(self, issue_number: int) -> None:
        url = f"https://api.github.com/repos/{self.repo}/issues/{issue_number}"
        payload = json.dumps({"state": "closed"}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, method="PATCH")
        req.add_header("Authorization", f"token {self.token}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            response.read()


def maybe_report_issue(agent: str, reason: str) -> Optional[int]:
    enabled = os.getenv("REPORT_ISSUES", "0") == "1"
    repo = os.getenv("REPORT_REPO", "")
    token = os.getenv("GITHUB_TOKEN", "")
    lang = os.getenv("REPORT_LANG", "tr").lower()
    if not enabled or not repo or not token:
        return None

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

    return IssueReporter(repo, token).create_issue(title, body)


def maybe_close_issue(repo: str, issue_number: int) -> None:
    enabled = os.getenv("REPORT_CLOSE_ISSUES", "0") == "1"
    token = os.getenv("GITHUB_TOKEN", "")
    lang = os.getenv("REPORT_LANG", "tr").lower()
    if not enabled or not repo or not token:
        return

    if lang == "tr":
        body = "Sorun cozuldu. RSI normale dondu. Issue kapatiliyor."
    else:
        body = "Issue resolved. RSI recovered. Closing."

    reporter = IssueReporter(repo, token)
    reporter.add_comment(issue_number, body)
    reporter.close_issue(issue_number)
