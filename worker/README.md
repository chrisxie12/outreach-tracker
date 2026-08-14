# Vision 61 CRM — Groq AI Gateway (Cloudflare Worker)

A tiny server-side gateway so the static GitHub Pages frontend can use Groq
**without ever placing an API key in the browser**. The frontend only knows the
gateway URL; the secret lives exclusively as a Cloudflare Worker secret.

## Why a Cloudflare Worker?

The CRM is a 100% static GitHub Pages app with no backend and no `package.json`.
A Cloudflare Worker is the smallest possible isolated server component that:

- keeps the existing GitHub Pages deployment completely untouched,
- needs zero npm dependencies (plain ES module),
- stores `GROQ_API_KEY` only as a Worker secret,
- provides CORS + request validation + structured errors.

## Endpoints

| Method | Path            | Purpose                                        |
|--------|-----------------|------------------------------------------------|
| GET    | `/v1/status`    | `{ configured, provider, model }`              |
| POST   | `/v1/analyze`   | Lead analysis                                  |
| POST   | `/v1/outreach`  | Outreach message generation (`context.channel`)|
| POST   | `/v1/followup`  | Follow-up generation                           |
| POST   | `/v1/explain`   | Audit explanation                              |

Request body:

```json
{
  "context": { "business": { "name": "..." }, "audit": { "...": "..." } }
}
```

Only a small, verified context object is sent. The worker never receives the
full CRM database, unrelated records, payment data, or any credentials.

## Environment variables

| Variable      | Required | Where set                     | Default             |
|---------------|----------|-------------------------------|---------------------|
| `GROQ_API_KEY`| Yes      | Worker **secret** (see below) | —                   |
| `GROQ_MODEL`  | No       | `wrangler.toml` `[vars]`      | `openai/gpt-oss-20b`|
| `ALLOWED_ORIGIN` | No    | Worker variable               | `*` (any origin)    |

`GROQ_API_KEY` must **never** be committed or placed in the browser.

## Deployment

```bash
cd worker
npm i -g wrangler          # or use npx
wrangler login
wrangler deploy            # deploy the code
wrangler secret put GROQ_API_KEY   # enter the key when prompted (never committed)
```

Set `ALLOWED_ORIGIN` (recommended) to your site origin, e.g.
`https://chrisxie12.github.io`:

```bash
npx wrangler secret put ALLOWED_ORIGIN
```

Local dev:

```bash
wrangler dev               # uses GROQ_API_KEY from your local env / .dev.vars
```

The Worker URL looks like `https://vision61-ai-gateway.<your-subdomain>.workers.dev`.
Put that URL into CRM **Settings → AI Assistant → Gateway URL** (or set the
`V61_AI_GATEWAY_URL` placeholder in the source — the UI makes it user-editable,
so no private URL is hardcoded).

## Cost control

- Maximum output tokens capped at 600.
- Prompts are concise.
- AI is only ever called after an explicit user action — never on page load,
  dashboard load, lead discovery, batch audit, or route navigation.

## Security notes

- The API key is read only from `env.GROQ_API_KEY` (a Worker secret).
- Never returned to the browser, never logged.
- Provider auth errors, stack traces, and internal messages are never forwarded.
- Responses are structured JSON with a safe `message` for the UI.
