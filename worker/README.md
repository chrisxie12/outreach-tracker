# Vision 61 CRM — Groq AI Gateway (Cloudflare Worker)

A tiny server-side gateway so the static GitHub Pages frontend can use Groq
**without ever placing an API key in the browser**. The frontend only knows the
gateway URL; secrets live exclusively as Cloudflare Worker secrets.

## Why a Cloudflare Worker?

The CRM is a 100% static GitHub Pages app with no backend and no `package.json`.
A Cloudflare Worker is the smallest possible isolated server component that:

- keeps the existing GitHub Pages deployment completely untouched,
- needs zero npm dependencies (plain ES module),
- stores `GROQ_API_KEY` and `V61_SHARED_SECRET` only as Worker secrets,
- provides origin-pinned CORS + request validation + structured errors.

## How authentication works

The browser cannot hold a reusable secret, so it authenticates with a
**short-lived, origin-bound session token**:

1. The frontend POSTs `{ "origin": "<its origin>" }` to `POST /v1/session`.
2. The Worker verifies the origin against `ALLOWED_ORIGIN`
   (`https://chrisxie12.github.io`) and returns a token signed with
   `V61_SHARED_SECRET`:
   `base64url(payload) + "." + hex(HMAC-SHA256(V61_SHARED_SECRET, payload))`
   where `payload = { v, iat, exp (now + 15 min), origin }`.
3. The frontend keeps the token **in memory only** (never `localStorage`,
   `sessionStorage`, `IndexedDB`, HTML, or source).
4. Every `/v1/status` and AI request sends `Authorization: Bearer <token>`.
   The Worker verifies the signature (constant time), the expiry, and that the
   token's origin matches the request Origin.

A captured token is useless after 15 minutes and cannot be replayed from
another origin. `V61_SHARED_SECRET` itself never leaves the Worker.

## Endpoints

| Method | Path            | Purpose                                          |
|--------|-----------------|--------------------------------------------------|
| POST   | `/v1/session`   | Issue a short-lived origin-bound token           |
| GET    | `/v1/status`    | `{ configured, provider, model }` (auth required)|
| POST   | `/v1/analyze`   | Lead analysis (auth required)                    |
| POST   | `/v1/outreach`  | Outreach message generation (auth required)      |
| POST   | `/v1/followup`  | Follow-up generation (auth required)             |
| POST   | `/v1/explain`   | Audit explanation (auth required)                |

Request body (AI endpoints):

```json
{
  "context": { "business": { "name": "..." }, "audit": { "...": "..." } }
}
```

Only a small, verified context object is sent. The worker never receives the
full CRM database, unrelated records, payment data, or any credentials.

## Environment variables

| Variable           | Required | Where set                     | Default                          |
|--------------------|----------|-------------------------------|----------------------------------|
| `GROQ_API_KEY`     | Yes      | Worker **secret** (see below) | —                                |
| `V61_SHARED_SECRET`| Yes      | Worker **secret** (see below) | —                                |
| `GROQ_MODEL`       | No       | `wrangler.toml` `[vars]`      | `openai/gpt-oss-20b`             |
| `ALLOWED_ORIGIN`   | No       | `wrangler.toml` `[vars]`      | `https://chrisxie12.github.io`   |

`GROQ_API_KEY` and `V61_SHARED_SECRET` must **never** be committed or placed in
the browser.

## Deployment

```bash
cd worker
npm i -g wrangler          # or use npx
wrangler login
wrangler deploy            # deploy the code
wrangler secret put GROQ_API_KEY       # enter the key when prompted (never committed)
wrangler secret put V61_SHARED_SECRET  # enter a long random string (never committed)
```

`ALLOWED_ORIGIN` and `GROQ_MODEL` are committed in `wrangler.toml [vars]`; no
secret input is needed for them.

Local dev:

```bash
wrangler dev               # uses secrets from your local env / .dev.vars
```

The Worker URL looks like `https://vision61-ai-gateway.<your-subdomain>.workers.dev`.
It is a frontend setting only (CRM **Settings → Outreach engine → AI Assistant →
Gateway URL**), plus a `V61_AI_GATEWAY_URL` default in `index.html`. No private
URL or secret is hardcoded in the browser bundle.

## Rate limiting (recommended)

Anonymous issuance of `/v1/session` must be bounded. Add a Cloudflare
**rate limiting rule** (edge ruleset) targeting the Worker route, e.g.:

- Requests per period: `50` per `1 minute` per IP for the whole route, or
  a stricter `10 / minute` on `POST /v1/session`.

This is Cloudflare-native, requires no code, and no KV namespace. If you ever
need per-IP budgets enforced in code, the token already carries `iat`/`exp`,
and a KV counter can be added later without changing the client.

## Cost control

- Maximum output tokens capped at 600.
- Prompts are concise.
- AI is only ever called after an explicit user action — never on page load,
  dashboard load, lead discovery, batch audit, or route navigation.
- AI output is always a DRAFT. The CRM never sends messages automatically and
  never mutates CRM records on behalf of AI.

## Security notes

- `GROQ_API_KEY` is read only from `env.GROQ_API_KEY` (a Worker secret).
- `V61_SHARED_SECRET` is read only from `env.V61_SHARED_SECRET` (a Worker
  secret) and used solely to sign/verify session tokens.
- Requests from any Origin other than `ALLOWED_ORIGIN` are rejected with 403;
  CORS is pinned (never echoed).
- Never returned to the browser, never logged.
- Provider auth errors, stack traces, and internal messages are never forwarded.
- Responses are structured JSON with a safe `message` for the UI.
