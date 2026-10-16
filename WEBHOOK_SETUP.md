# GitHub Webhook Setup (ProofLoop)

## What it does

When a candidate pushes code to their repository, GitHub sends a message to ProofLoop. ProofLoop re-analyzes the repo and saves a **new revision** (visible in History). Nobody has to click "Reassess".

```
git push  →  GitHub  →  POST /api/webhooks/github  →  verify signature  →  reassess  →  new revision
```

## Rules the receiver follows

| Situation | Result |
|---|---|
| No `GITHUB_WEBHOOK_SECRET` set on the server | **Rejected** (401). Nothing is accepted without a secret. |
| Signature missing or wrong | Rejected (401) |
| `ping` event (sent when you create the webhook) | 200, no changes |
| Push to the repo's **default branch** | Reassessed, new revision saved |
| Push to another branch, a tag, or a branch deletion | 200, ignored |
| Repo that has no ProofLoop assessment yet | 200, ignored |
| Same delivery received twice | Second one skipped |
| Reassessment fails | 500. Previous revision is kept. Delivery is **not** marked done, so GitHub's **Redeliver** button can retry it. |

> The repo must already have been assessed in ProofLoop (submitted on the onboarding page). The webhook only updates existing assessments.

## Step 1 — Create a secret

```bash
openssl rand -hex 32
```

Copy the output. This is your webhook secret.

## Step 2 — Put it in `.env.local`

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

```
GITHUB_WEBHOOK_SECRET=<the value from step 1>
```

Never commit `.env.local` and never put it in a zip you share. Each teammate creates their own secret.

Start the app: `npm run dev`

## Step 3 — Give GitHub a public address

GitHub cannot reach `localhost`. Use a tunnel (or deploy the app):

```bash
ngrok http 3000
```

Copy the `https://….ngrok-free.app` address it prints.

## Step 4 — Add the webhook on GitHub

In the repository: **Settings → Webhooks → Add webhook**

| Field | Value |
|---|---|
| Payload URL | `https://<your-public-host>/api/webhooks/github` |
| Content type | `application/json` |
| Secret | the same secret from step 1 |
| Events | **Just the push event** |
| Active | checked |

Click **Add webhook**. GitHub immediately sends a `ping`. A green tick under **Recent Deliveries** means it works.

## Step 5 — Test it

**With GitHub:** push a commit to the default branch, then check **Settings → Webhooks → Recent Deliveries**. A `200` response means ProofLoop received it. Open the ProofLoop History page to see the new revision.

**Without GitHub (local check):**

```bash
BODY='{"zen":"test"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | sed 's/^.* //')"
curl -i -X POST http://localhost:3000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-GitHub-Delivery: local-test-1" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
```

Expected: `200` with "Ping received". Change one character of `$SIG` and you should get `401`.

**Demo mode:** the in-app **Webhook Simulator** signs and sends a fake push for you, so it works without GitHub or a tunnel.

## Troubleshooting

| You see | Cause |
|---|---|
| `401` "GITHUB_WEBHOOK_SECRET is not configured" | The secret is not set on the server. Add it to `.env.local` and restart. |
| `401` "Invalid webhook signature" | The secret in GitHub differs from the one in `.env.local`, or the content type is not `application/json`. |
| `200` "No active ProofLoop assessment found" | That repo was never assessed. Submit it on the onboarding page first. |
| `200` "Push to refs/heads/… ignored" | The push was not on the default branch. |
| `500` "Reassessment failed" | GitHub API issue (rate limit, private repo without `GITHUB_TOKEN`). Fix it, then click **Redeliver** in GitHub. |
| GitHub shows a timeout | GitHub waits 10 seconds for a reply, and analysing a large repo can take longer. GitHub then marks the delivery failed even though the server may still finish. Check the History page: if the new revision is there it worked (a Redeliver would be skipped as a duplicate). |

## Local development without a secret (optional)

For local testing only, you may set `PROOFLOOP_ALLOW_UNSIGNED_WEBHOOKS=true` and leave the secret empty. This is ignored when `NODE_ENV=production`.
