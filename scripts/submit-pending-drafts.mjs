import { access, mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";

const { SUBMIT_ENDPOINT, SUBMIT_DRAFT_SECRET } = process.env;
const missingEnvironmentVariables = [
  ["SUBMIT_ENDPOINT", SUBMIT_ENDPOINT],
  ["SUBMIT_DRAFT_SECRET", SUBMIT_DRAFT_SECRET],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnvironmentVariables.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnvironmentVariables.join(", ")}`,
  );
  process.exitCode = 1;
} else {
  await submitPendingDrafts();
}

async function submitPendingDrafts() {
  const pendingDirectory = path.resolve("drafts", "pending");
  const postedDirectory = path.resolve("drafts", "posted");
  let entries;

  try {
    entries = await readdir(pendingDirectory, { withFileTypes: true });
  } catch (error) {
    console.error(`Could not read drafts/pending/: ${formatError(error)}`);
    process.exitCode = 1;
    return;
  }

  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort(compareFilenames);

  if (filenames.length === 0) {
    console.log("No pending draft files found.");
    console.log("Summary: 0 submitted, 0 failed");
    return;
  }

  let submitted = 0;
  let failed = 0;

  for (const filename of filenames) {
    const pendingPath = path.join(pendingDirectory, filename);
    let draft;

    try {
      const fileContents = await readFile(pendingPath, "utf8");
      draft = JSON.parse(fileContents);
    } catch (error) {
      console.error(`${filename}: could not parse JSON (${formatError(error)})`);
      failed += 1;
      continue;
    }

    const validationError = validateDraft(draft);
    if (validationError) {
      console.error(`${filename}: invalid draft (${validationError})`);
      failed += 1;
      continue;
    }

    let response;
    let responseBody;

    try {
      response = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-api-key": SUBMIT_DRAFT_SECRET,
        },
        body: JSON.stringify(draft),
      });
      responseBody = await response.text();
    } catch (error) {
      console.error(`${filename}: request failed (${formatError(error)})`);
      failed += 1;
      continue;
    }

    if (response.status !== 200) {
      console.error(
        `${filename}: submission failed with HTTP ${response.status}: ${truncate(responseBody)}`,
      );
      failed += 1;
      continue;
    }

    submitted += 1;

    let returnedId = "(id not present in response)";
    try {
      const result = JSON.parse(responseBody);
      if (typeof result?.id === "string" && result.id.length > 0) {
        returnedId = result.id;
      }
    } catch {
      // HTTP 200 is the endpoint's success contract; keep the raw response optional.
    }
    console.log(`${filename}: submitted successfully (id: ${returnedId})`);

    try {
      await mkdir(postedDirectory, { recursive: true });
      const destination = await availableDestination(postedDirectory, filename);
      await rename(pendingPath, destination);
    } catch (error) {
      console.error(`${filename}: submitted but could not move to posted/ (${formatError(error)})`);
      failed += 1;
    }
  }

  console.log(`Summary: ${submitted} submitted, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function validateDraft(draft) {
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
    return "top-level value must be an object";
  }
  if (typeof draft.text !== "string" || draft.text.trim().length === 0) {
    return "text must be a non-empty string";
  }
  if (typeof draft.image !== "object" || draft.image === null || Array.isArray(draft.image)) {
    return "image must be an object";
  }
  if (typeof draft.image.title !== "string" || draft.image.title.trim().length === 0) {
    return "image.title must be a non-empty string";
  }
  return null;
}

async function availableDestination(directory, filename) {
  const extension = path.extname(filename);
  const basename = path.basename(filename, extension);
  let suffix = 1;

  while (true) {
    const candidateName = suffix === 1 ? filename : `${basename}-${suffix}${extension}`;
    const candidatePath = path.join(directory, candidateName);

    try {
      await access(candidatePath);
      suffix += 1;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return candidatePath;
      }
      throw error;
    }
  }
}

function compareFilenames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function truncate(value, maximumLength = 500) {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, maximumLength)}...`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
