# fb-page-post-agent

A small pipeline that turns a scheduled AI agent's daily writing into a Facebook Page post,
with a human approval step in between.

## How a post travels

```
scheduled agent  →  git push  →  GitHub Actions  →  Cloudflare Worker  →  Discord
   (writes)         (delivery)     (bridge)          (state + publish)    (you approve)
```

1. **The agent writes.** A scheduled cloud agent reads `content-plan.md`, takes the next topic in
   order, researches it, and writes a draft JSON file into `drafts/pending/`, then pushes.
   Its sandbox blocks outbound HTTP, so pushing to git is the only way it can deliver anything —
   which is why the GitHub Actions bridge exists.
2. **Actions delivers.** A push touching `drafts/pending/**` runs
   `scripts/submit-pending-drafts.mjs`, which POSTs each draft to the Worker's `/submit-draft`
   and moves the file to `drafts/submitted/`.
3. **The Worker holds it.** The draft is stored in Cloudflare KV and posted to Discord with
   Approve / Reject buttons.
4. **You decide.** Approve publishes the caption to the Facebook Page; Reject discards it.

`drafts/submitted/` means *sent to Discord*, not *published to Facebook*. Nothing reaches the
Page without a button press.

## Layout

| Path | What it is |
| --- | --- |
| `content-plan.md` | The ordered editorial plan. The agent must follow it; you own it. |
| `drafts/pending/` | Drafts waiting to be delivered to Discord. |
| `drafts/submitted/` | Drafts already sent to Discord. |
| `scripts/submit-pending-drafts.mjs` | The delivery script Actions runs. |
| `.github/workflows/publish-draft.yml` | Fires on pushes to `drafts/pending/**`. |
| `worker/` | The Cloudflare Worker — the only live backend. See `worker/README.md`. |

## Draft format

```json
{
  "text": "The finished Facebook caption",
  "image": {
    "title": "Short topic label",
    "subtitle": "Optional supporting line",
    "sourceUrl": "https://example.com/optional-source"
  }
}
```

`text` and `image.title` are required. See `drafts/README.md` for the full contract.

## Images

There are none generated. An earlier version rendered a card image from `image.title` and
`image.subtitle` via satori + resvg; that rasteriser cannot position Thai tone marks stacked
above upper vowels, so every card shipped with mangled Thai — `สิ่งที่` came out as `สิงที`.
Swapping fonts does not fix it; the shaping step is the problem. The renderer was removed
rather than left to quietly corrupt text. Attach real screenshots by hand instead — which is
also what the reference pages this one is modelled on actually do.

The `image` fields are still carried in the draft JSON: `title` labels the draft in Discord and
in history, and `sourceUrl` records where a claim came from.

## Repository configuration

The Actions workflow needs both of these set on the repo:

- Secret `SUBMIT_DRAFT_SECRET` — the API key the Worker expects.
- Variable `SUBMIT_ENDPOINT` — the Worker's `/submit-draft` URL.

## History

`netlify/` held the original implementation. The Netlify account ran out of credits and could no
longer deploy — env-var changes need a redeploy to take effect, so the Facebook token could never
have been wired up there. The backend was ported to Cloudflare Workers and the Netlify copy
deleted; git history has it if it is ever needed.
