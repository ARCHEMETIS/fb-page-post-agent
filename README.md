# Facebook Page approval backend

This is a small, functions-only Netlify backend for a human approval step between an external content-writing agent and a Facebook Page. It does not research trends or write content, and it has no frontend.

## Flow

1. The external scheduled agent sends a finished draft to `POST /submit-draft` with the `x-api-key` header. The function renders a 1080x1080 PNG card, stores the draft in the site-scoped `drafts` Netlify Blobs store, and sends the draft plus Approve/Reject buttons to Discord.
2. Discord sends button interactions to `POST /discord-interactions`. The function verifies Discord's Ed25519 signature against the untouched raw request body.
3. Approve calls the shared Facebook publisher, uploads the image and caption to the Page, and deletes the stored draft. Reject deletes the draft without publishing. A Facebook failure is shown in Discord and leaves the draft stored so the action can be retried.

## Functions

- `netlify/functions/submit-draft.mts` — authenticated integration point for finished drafts.
- `netlify/functions/discord-interactions.mts` — Discord ping and button interaction endpoint.
- `netlify/functions/_shared/facebook.ts` — shared Facebook Graph API photo publisher used by the interaction function.

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
