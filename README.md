# Facebook Page approval backend

This is a small, functions-only Netlify backend for a human approval step between an external content-writing agent and a Facebook Page. It does not research trends or write content, and it has no frontend.

## Flow

1. Before writing a draft, the external scheduled agent can call `GET /post-history` (same `x-api-key`) to see the last 30 submitted topics, to avoid repeating itself.
2. The agent sends a finished draft to `POST /submit-draft` with the `x-api-key` header. The function renders a 1080x1080 PNG card, stores the draft in the site-scoped `drafts` Netlify Blobs store, sends the draft plus Approve/Reject buttons to Discord, and appends `{date, title, text}` to the `history` Blobs store (capped at the last 30 entries; best-effort — a history-write failure doesn't fail the submission).
3. Discord sends button interactions to `POST /discord-interactions`. The function verifies Discord's Ed25519 signature against the untouched raw request body.
4. Approve calls the shared Facebook publisher, uploads the image and caption to the Page, and deletes the stored draft. Reject deletes the draft without publishing. A Facebook failure is shown in Discord and leaves the draft stored so the action can be retried.

## Functions

- `netlify/functions/submit-draft.mts` — authenticated integration point for finished drafts.
- `netlify/functions/post-history.mts` — authenticated read of the last 30 submitted topics, for duplicate avoidance.
- `netlify/functions/discord-interactions.mts` — Discord ping and button interaction endpoint.
- `netlify/functions/_shared/facebook.ts` — shared Facebook Graph API photo publisher used by the interaction function.
- `netlify/functions/_shared/history.ts` — read/append helpers for the `history` Blobs store.

The submit body is:

```json
{
  "text": "The finished Facebook caption",
  "image": {
    "title": "Card title",
    "subtitle": "Optional supporting line",
    "sourceUrl": "https://example.com/optional-source"
  }
}
```

## Environment variables

Copy `.env.example` to `.env` for local development and fill in all six values:

- `SUBMIT_DRAFT_SECRET`
- `DISCORD_BOT_TOKEN`
- `DISCORD_PUBLIC_KEY`
- `DISCORD_CHANNEL_ID`
- `FACEBOOK_PAGE_ID`
- `FACEBOOK_PAGE_ACCESS_TOKEN`

In production, configure the same values as Netlify environment variables. In the Discord Developer Portal, set the application's Interactions Endpoint URL to `https://YOUR-SITE.netlify.app/discord-interactions`.

## Local development

Install dependencies and start the Netlify development server:

```sh
npm install
npx netlify dev
```

Then call `http://localhost:8888/submit-draft` (the port is printed by the CLI). This project does not use Vite, so local Netlify Blobs access requires `netlify dev`; invoking the source function directly does not configure the local Blob store.

Run the TypeScript check with:

```sh
npm run typecheck
```

Live Discord and Facebook publishing require real credentials and a Discord bot that can send messages and attach files in the configured channel.

## GitHub Actions draft bridge

The scheduled cloud agent cannot make outbound requests to the Netlify domain from its sandbox, but it can commit and push files to GitHub. It writes each finished JSON draft to `drafts/pending/`; the `Publish pending drafts` workflow then sends pending drafts to the already-deployed `/submit-draft` endpoint and moves successful files to `drafts/posted/`. See `drafts/README.md` for the file contract and an example.

Configure these repository settings before using the workflow:

- Actions secret `SUBMIT_DRAFT_SECRET`: the API key expected by the live endpoint.
- Actions variable `SUBMIT_ENDPOINT`: the full live URL, `https://archemetis-fb-approval.netlify.app/submit-draft`.
