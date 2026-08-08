import type { Env } from "./types";
import { requireEnv, truncate } from "./utils";

export async function postDraftToDiscord(
  env: Env,
  id: string,
  text: string,
  imagePng: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const channelId = requireEnv(env.DISCORD_CHANNEL_ID, "DISCORD_CHANNEL_ID");
  const botToken = requireEnv(env.DISCORD_BOT_TOKEN, "DISCORD_BOT_TOKEN");
  const form = new FormData();

  form.append(
    "payload_json",
    JSON.stringify({
      content: truncate(text, 2_000),
      attachments: [{ id: 0, filename: "draft.png" }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "Approve", custom_id: `approve:${id}` },
            { type: 2, style: 4, label: "Reject", custom_id: `reject:${id}` },
          ],
        },
      ],
    }),
  );
  form.append("files[0]", new Blob([imagePng], { type: "image/png" }), "draft.png");

  const response = await fetch(
    `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}` },
      body: form,
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Discord API request failed (${response.status}): ${detail}`);
  }
}

export async function editOriginalInteraction(
  applicationId: string,
  interactionToken: string,
  content: string,
): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(interactionToken)}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: truncate(content, 2_000), components: [] }),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Unable to edit Discord interaction (${response.status}): ${detail}`);
  }
}
