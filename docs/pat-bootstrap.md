# PAT Bootstrap

## When To Use PAT

Use a fine-grained GitHub Personal Access Token only as a manual fallback when a Devin worker needs direct HTTPS access to a private repository and the GitHub App broker is not available for that session.

The long-term contour is still GitHub App first because installation tokens are short-lived and scoped by repo. PAT is simpler for a quick handoff, but it is easier to leak and must be handled carefully.

## Recommended PAT Settings

Create a fine-grained PAT in GitHub with:

- Repository access: only the target repo, for example `lumamax/devin-dashboard`
- Contents: read/write
- Pull requests: read/write if the worker should open PRs
- Metadata: read
- Expiration: short, preferably 7 to 30 days for active work

Do not use a classic broad PAT unless there is no alternative.

## Safe Clone Pattern

Do not paste the PAT into committed files or handoff docs.

Preferred pattern inside a private Devin session:

```bash
export GITHUB_TOKEN='paste-the-fine-grained-pat-here'
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/lumamax/devin-dashboard.git
cd devin-dashboard
git remote set-url origin https://x-access-token:${GITHUB_TOKEN}@github.com/lumamax/devin-dashboard.git
git status
```

If the worker only needs read access, remove write permissions from the PAT.

## Handoff Rule

In handoffs, include the repo URL and branch/PR state, but never include the PAT itself.

Good:

```text
Repo: https://github.com/lumamax/devin-dashboard.git
Branch: main
Auth: fine-grained PAT provided in Devin session secret/env, not in repo
```

Bad:

```text
https://x-access-token:real-token-value@github.com/...
```
