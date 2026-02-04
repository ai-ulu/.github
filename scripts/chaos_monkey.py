import os
import json
import random
import base64
import urllib.request

TOKEN = os.environ.get("GITHUB_TOKEN")
ORG = "ai-ulu"

def github_request(url, method="GET", data=None):
    headers = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}
    req = urllib.request.Request(url, headers=headers, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(req, data=data) as res:
            return json.loads(res.read().decode()), res.status
    except Exception as e:
        print(f"Error: {e}")
        return None, 0

def inject_chaos():
    repos, status = github_request(f"https://api.github.com/orgs/{ORG}/repos?per_page=100")
    if not repos: return
    
    eligible = [r["name"] for r in repos if r["name"] not in [".github", "ai-ulu.github.io", "QA"]]
    target_repo = random.choice(eligible)
    print(f"🐒 Chaos Monkey is attacking: {target_repo}")
    
    path = "tests/chaos_test.js"
    content = "test('chaos failure', () => { throw new Error('Chaos Injected!'); });"
    b64_content = base64.b64encode(content.encode()).decode()
    
    url = f"https://api.github.com/repos/{ORG}/{target_repo}/contents/{path}"
    data = {"message": "🔥 Chaos Monkey injection", "content": b64_content, "branch": "main"}
    
    # Check if exists
    existing, _ = github_request(url)
    if existing and "sha" in existing:
        data["sha"] = existing["sha"]
        
    _, status = github_request(url, method="PUT", data=data)
    if status in [200, 201]:
        print(f"✅ Chaos injected into {target_repo}")
    else:
        print(f"❌ Failed to inject chaos")

if __name__ == "__main__":
    inject_chaos()
