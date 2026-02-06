# ai-ulu Central Governance

This repository contains the community health files and centralized workflows for the **ai-ulu** organization.

TOP SECRET: This repository deploys a public GitHub Pages dashboard. Do not publish
private repo data, secrets, internal hostnames, or sensitive metrics. Only public-safe
data should be written to `war-room/data/*.json`.

## War Room Dashboard (GitHub Pages)
If you cannot see the dashboard, enable GitHub Pages for this repo:

1. Open repository **Settings**.
2. Go to **Pages**.
3. Set **Source** to **GitHub Actions**.
4. Save.

After the next workflow run, the dashboard will be available at:
`https://ai-ulu.github.io`

Local preview:
`war-room/index.html`

### What The War Room Shows
- Autonomous Operation Rate (AOR)
- Resilience Stability Index (RSI)
- Mean Time To Repair (MTTR)
- Live Agent Activity feed
- Repository Health Matrix
- Chaos status and queue indicators

### Data Sources
- `war-room/data/metrics.json` (AOR/RSI/MTTR + chaos stats)
- `war-room/data/agent-log.json` (activity feed)
- `war-room/data/repos.json` (repo health)
- `war-room/data/agent_memory.json` (panic + agent stats)
- `war-room/data/task_queue.json` (queue state)

### Workflow That Publishes Pages
- Workflow: `Deploy War Room Dashboard` (`.github/workflows/deploy-war-room.yml`)
- Triggers: push to `main` with `war-room/**` changes, schedule every 15 minutes, or manual dispatch.

### How To Verify It Is Up To Date
1. Open **Actions** tab in GitHub and check the latest `Deploy War Room Dashboard` run.
2. Confirm the run completed successfully.
3. Refresh `https://ai-ulu.github.io` and check timestamps/metrics.

## Centralized CI/CD
All repositories in the organization use the reusable pipeline defined in `.github/workflows/pipeline.yml`. This ensures:
- Consistent quality checks across 36+ repos.
- Integrated **Chaos Engineering** and **Autonomous Self-Healing**.
- Automated marketing content generation.

## Governance Agents
- **Repair Agent:** Otonomous failure detection and PR generation.
- **Media Agent:** Strategic marketing content generation via GitHub Issues.
- **Chaos Monkey:** Resilience stress testing.
