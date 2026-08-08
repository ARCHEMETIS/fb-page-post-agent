// Delivers the agent's "I need a fact only you have" questions to Discord.
//
// The agent must never invent a personal memory. When the next planned topic needs one that
// isn't in author-notes.md, it writes the questions to needs-input/ instead of guessing its way
// to a publishable draft. Those files would otherwise sit in the repo unread, so this ships them
// to the same Discord channel the drafts go to — as plain messages, with no Approve button,
// because there is nothing here to publish.

import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";

const { DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  console.error("DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID must both be set.");
  process.exitCode = 1;
} else {
  await sendPendingQuestions();
}

async function sendPendingQuestions() {
  const pendingDirectory = path.resolve("needs-input");
  const sentDirectory = path.join(pendingDirectory, "sent");

  let entries;
  try {
    entries = await readdir(pendingDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      console.log("No needs-input/ directory. Nothing to send.");
      return;
    }
    console.error(`Could not read needs-input/: ${formatError(error)}`);
    process.exitCode = 1;
    return;
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  if (filenames.length === 0) {
    console.log("No question files to send.");
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const filename of filenames) {
    const source = path.join(pendingDirectory, filename);
    let body;
    try {
      body = await readFile(source, "utf8");
    } catch (error) {
      console.error(`${filename}: could not read (${formatError(error)})`);
      failed += 1;
      continue;
    }

    const content = truncate(
      `❓ **agent ต้องการข้อมูลจากคุณ** — \`${filename}\`\n\n${body.trim()}`,
      2000,
    );

    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${encodeURIComponent(DISCORD_CHANNEL_ID)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          // Questions quote researched text; never let that ping anyone.
          body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
        },
      );

      if (response.status !== 200) {
        const detail = (await response.text()).slice(0, 500);
        console.error(`${filename}: Discord returned ${response.status}: ${detail}`);
        failed += 1;
        continue;
      }
    } catch (error) {
      console.error(`${filename}: request failed (${formatError(error)})`);
      failed += 1;
      continue;
    }

    console.log(`${filename}: sent`);
    sent += 1;

    // Move it aside so tomorrow's run doesn't ask the same question again.
    try {
      await mkdir(sentDirectory, { recursive: true });
      await rename(source, await availableDestination(sentDirectory, filename));
    } catch (error) {
      console.error(`${filename}: sent but could not move to sent/ (${formatError(error)})`);
      failed += 1;
    }
  }

  console.log(`Summary: ${sent} sent, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

async function availableDestination(directory, filename) {
  const extension = path.extname(filename);
  const basename = path.basename(filename, extension);
  for (let suffix = 1; ; suffix += 1) {
    const candidate = path.join(
      directory,
      suffix === 1 ? filename : `${basename}-${suffix}${extension}`,
    );
    try {
      await readFile(candidate);
    } catch (error) {
      if (error?.code === "ENOENT") return candidate;
      throw error;
    }
  }
}

function truncate(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
