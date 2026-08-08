const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!applicationId || !botToken) {
  console.error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN must be set.");
  process.exitCode = 1;
} else {
  const commands = [
    { name: "status", description: "Show pending draft count and Facebook configuration status" },
    { name: "history", description: "Show the five most recent submitted posts" },
    { name: "pending", description: "List drafts awaiting approval" },
  ];

  const response = await fetch(
    `https://discord.com/api/v10/applications/${encodeURIComponent(applicationId)}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    },
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1_000);
    console.error(`Discord command registration failed (${response.status}): ${detail}`);
    process.exitCode = 1;
  } else {
    const registered = await response.json();
    console.log(`Registered ${registered.length} global Discord commands.`);
  }
}
