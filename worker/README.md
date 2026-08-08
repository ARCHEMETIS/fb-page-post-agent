# Cloudflare Worker approval backend

This directory contains the Cloudflare Workers port of the frozen Netlify Functions backend. It renders submitted Facebook Page drafts as 1080x1080 PNG cards, stores them in Cloudflare KV, sends them to Discord for approval, and publishes approved posts through the Facebook Graph API.

## Routes

- `POST /submit-draft` requires `x-api-key` matching `SUBMIT_DRAFT_SECRET`. It accepts `{ text, image: { title, subtitle?, sourceUrl? } }`, renders and stores the draft, sends it to Discord, and returns `{ id }`.
- `GET /post-history` uses the same API-key check and returns the most recent 30 history entries.
- `POST /discord-interactions` verifies Discord Ed25519 signatures, answers PING requests, handles Approve/Reject buttons, and serves `/status`, `/history`, and `/pending` commands.

Button interactions return Discord's deferred update response immediately. Facebook publishing then runs in `waitUntil`, and the Worker patches the original Discord message when it finishes. This improves on the frozen Netlify implementation, which performed publishing inline and could exceed Discord's three-second response window.

## First-time setup

Run these steps in order from this directory:

1. Install dependencies:

   ```sh
   npm install
   ```

2. Authenticate Wrangler:

   ```sh
   npx wrangler login
   ```

3. Create the KV namespace:

   ```sh
   npx wrangler kv namespace create DRAFTS
   ```

4. Paste the returned namespace id into `wrangler.toml`, replacing `REPLACE_WITH_DRAFTS_KV_NAMESPACE_ID`. Also set the non-secret `DISCORD_CHANNEL_ID` variable there.

5. Add every Worker secret (Facebook values may be added later; until then only Approve reports that publishing is not configured):

   ```sh
   npx wrangler secret put SUBMIT_DRAFT_SECRET
   npx wrangler secret put DISCORD_BOT_TOKEN
   npx wrangler secret put DISCORD_PUBLIC_KEY
   npx wrangler secret put DISCORD_APPLICATION_ID
   npx wrangler secret put FACEBOOK_PAGE_ID
   npx wrangler secret put FACEBOOK_PAGE_ACCESS_TOKEN
   ```

6. Deploy:

   ```sh
   npx wrangler deploy
   ```

7. In the Discord Developer Portal, set the application's Interactions Endpoint URL to `https://<worker>.workers.dev/discord-interactions`.

8. Change the GitHub repository variable `SUBMIT_ENDPOINT` to `https://<worker>.workers.dev/submit-draft`.

9. Register the global slash commands. Export `DISCORD_APPLICATION_ID` and `DISCORD_BOT_TOKEN` in the shell running the script, then run:

   ```sh
   npm run register-commands
   ```

Global commands can take time to appear in Discord.

## Local development

Start the Worker locally with:

```sh
npx wrangler dev
```

Wrangler provides local KV storage by default. Put local values in `.dev.vars` if needed; that file is ignored by Wrangler and must never be committed. Run `npm run typecheck` for the TypeScript check, and test the production bundle without deploying with `npx wrangler deploy --dry-run --outdir dist`.

## Bindings and secrets

The `DRAFTS` KV namespace stores `draft:<uuid>` records and the `history` array. `DISCORD_CHANNEL_ID` is a plain Wrangler variable. The Worker uses these secrets: `SUBMIT_DRAFT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `FACEBOOK_PAGE_ID`, and `FACEBOOK_PAGE_ACCESS_TOKEN`.
