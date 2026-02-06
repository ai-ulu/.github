# Setup

This repo deploys the War Room dashboard to GitHub Pages via Actions.

1. Open repository Settings.
2. Go to Pages.
3. Set Source to "GitHub Actions".
4. Save.

Notes:
- The deploy workflow runs on every push to `main` that touches `war-room/**`
  and on a 15-minute schedule.
- The workflow expects a `GITHUB_TOKEN` with default repo access. If Actions
  permissions are restricted, ensure `contents: read` and `pages: write`.
