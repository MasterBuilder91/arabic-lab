# Arabic Lab

Generative drill engine for classical Arabic — pours any root into any morphological pattern (wazn) algorithmically at runtime, instead of storing fixed flashcards. Cloudflare Worker + D1, static frontend served as Worker assets.

## Deploy

```
npm install
npx wrangler login
npx wrangler deploy
```

The D1 binding in `wrangler.toml` points at the `arabic-lab-db` database already provisioned on the Cloudflare account. First deploy needs nothing else.

## Structure

- `src/drillEngine.ts` — the root+pattern substitution algorithm (the generative core)
- `src/db.ts` — D1 queries: roots, patterns, stages, attempts, progress
- `src/index.ts` — Worker fetch handler / API routes (`/api/stages`, `/api/drill/next`, `/api/drill/submit`)
- `public/` — static frontend (vanilla HTML/CSS/JS), served via Worker static assets

## Current content

Stage 1 only: sound (fully regular) triliteral roots, Form I past-tense verb + active participle. 10 seeded roots. Everything else — later stages, irregular-root overrides, auth — is open.
