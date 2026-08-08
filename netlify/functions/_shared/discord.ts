import { requireEnv } from "./env.js";

function discordContent(text: string): string {
  return text.length <= 2_000 ? text : `${text.slice(0, 1_999)}…`;
}

export async function postDraftToDiscord(
  id: string,
  text: string,
  imagePng: Buffer,
): Promise<void> {
  const channelId = requireEnv("DISCORD_CHANNEL_ID");
  const botToken = requireEnv("DISCORD_BOT_TOKEN");
  const form = new FormData();
  const pngBytes = Uint8Array.from(imagePng);

  form.append(
    "payload_json",
    JSON.stringify({
      content: discordContent(text),
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
  form.append("files[0]", new Blob([pngBytes], { type: "image/png" }), "draft.png");

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
