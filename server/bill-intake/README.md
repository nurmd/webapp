# Bill Intake extraction proxy

Single-purpose service that lets the Vyapar Books app read invoices with a vision
model without shipping a provider key inside the PWA/APK.

Zero dependencies. Node 20+.

```bash
cp .env.example .env      # add GEMINI_API_KEY (or OPENAI_API_KEY) and INTAKE_TOKEN
node --env-file=.env server.mjs
```

```
GET  /health    -> { ok, provider, model, authRequired }
POST /extract   -> { data, model, provider, durationMs }
```

`POST /extract` body:

```json
{ "fileName": "inv-042.pdf", "mimeType": "application/pdf", "dataBase64": "..." }
```

Limits: 18 MB body, PDF/JPG/PNG/WEBP, 60 documents per 10 minutes per IP.

## What it does not do

- No GST logic — every amount is recomputed in the client (`src/core/gst/calculator.ts`).
- No storage — documents are forwarded and discarded.
- No logging of document contents — only file name, size, model and latency.

## Deploy notes

- Put it behind TLS (Caddy/Nginx/Cloudflare) and set `INTAKE_TOKEN`.
- Restrict `ALLOWED_ORIGINS` to your app's origin in production.
- It is stateless, so scale horizontally without coordination.
- For data-residency requirements, deploy in an Indian region or point
  `OPENAI_BASE_URL` at a self-hosted OpenAI-compatible vision model.
