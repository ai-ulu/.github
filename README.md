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

## Centralized CI/CD
All repositories in the organization use the reusable pipeline defined in `.github/workflows/pipeline.yml`. This ensures:
- Consistent quality checks across 36+ repos.
- Integrated **Chaos Engineering** and **Autonomous Self-Healing**.
- Automated marketing content generation.

## Governance Agents
- **Repair Agent:** Otonomous failure detection and PR generation.
- **Media Agent:** Strategic marketing content generation via GitHub Issues.
- **Chaos Monkey:** Resilience stress testing.
