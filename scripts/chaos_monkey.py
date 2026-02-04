import os
import requests
import random
import base64

TOKEN = os.environ.get("GITHUB_TOKEN")
ORG = "ai-ulu"
headers = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github.v3+json"}

def inject_chaos():
    # 1. Get repos
    repos_res = requests.get(f"https://api.github.com/orgs/{ORG}/repos", headers=headers)
    repos = [r["name"] for r in repos_res.json() if r["name"] not in [".github", "ai-ulu.github.io", "QA"]]
    
    if not repos: return
    
    target_repo = random.choice(repos)
    print(f"🐒 Chaos Monkey is attacking: {target_repo}")
    
    # 2. Inject a "failing test" file
    chaos_content = "test('chaos failure', () => { expect(true).toBe(false); });"
    b64_content = base64.b64encode(chaos_content.encode()).decode()
    
    path = "tests/chaos_test.js"
    url = f"https://api.github.com/repos/{ORG}/{target_repo}/contents/{path}"
    
    data = {
        "message": "🔥 Chaos Monkey: Injected failure for resilience testing",
        "content": b64_content,
        "branch": "main" # Directly to main for maximum chaos in this simulation
    }
    
    # First check if exists to get SHA if updating (though we expect new)
    res = requests.get(url, headers=headers)
    if res.status_code == 200:
        data["sha"] = res.json()["sha"]
    
    put_res = requests.put(url, headers=headers, json=data)
    if put_res.status_code in [200, 201]:
        print(f"✅ Chaos injected into {target_repo} at {path}")
    else:
        print(f"❌ Failed to inject chaos: {put_res.text}")

if __name__ == "__main__":
    inject_chaos()
