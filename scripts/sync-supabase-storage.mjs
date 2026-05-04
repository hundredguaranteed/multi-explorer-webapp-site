import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const dataRoot = path.join(projectRoot, "data");
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "").trim();
const SUPABASE_STORAGE_PREFIX = String(process.env.SUPABASE_STORAGE_PREFIX || "")
  .split("/")
  .map((segment) => segment.trim())
  .filter(Boolean)
  .join("/");
const SUPABASE_UPLOAD_CACHE_CONTROL = String(
  process.env.SUPABASE_UPLOAD_CACHE_CONTROL || "public, max-age=31536000, immutable",
).trim();
const MAX_UPLOAD_BYTES = 49 * 1024 * 1024;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath));
      continue;
    }
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function remoteObjectPath(localFile) {
  const relative = path.relative(dataRoot, localFile).split(path.sep).join("/");
  return [SUPABASE_STORAGE_PREFIX, relative].filter(Boolean).join("/");
}

async function uploadFile(localFile) {
  const stats = await fs.stat(localFile);
  if (stats.size > MAX_UPLOAD_BYTES) {
    return { objectPath: remoteObjectPath(localFile), skipped: true, reason: "oversize" };
  }
  const objectPath = remoteObjectPath(localFile);
  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  const body = await fs.readFile(localFile);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "x-upsert": "true",
      "content-type": contentTypeFor(localFile),
      "cache-control": SUPABASE_UPLOAD_CACHE_CONTROL,
    },
    body,
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Upload failed for ${objectPath}: ${response.status} ${details}`);
  }
  return { objectPath, skipped: false };
}

async function ensureBucket() {
  const listResponse = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: {
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!listResponse.ok) {
    const details = await listResponse.text();
    throw new Error(`Failed to list buckets: ${listResponse.status} ${details}`);
  }
  const buckets = await listResponse.json();
  if (Array.isArray(buckets) && buckets.some((bucket) => bucket?.name === SUPABASE_STORAGE_BUCKET)) {
    return;
  }

  const createResponse = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      name: SUPABASE_STORAGE_BUCKET,
      public: true,
      file_size_limit: null,
      allowed_mime_types: null,
    }),
  });
  if (!createResponse.ok) {
    const details = await createResponse.text();
    throw new Error(`Failed to create bucket ${SUPABASE_STORAGE_BUCKET}: ${createResponse.status} ${details}`);
  }
}

async function main() {
  requireEnv("SUPABASE_URL", SUPABASE_URL);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
  requireEnv("SUPABASE_STORAGE_BUCKET", SUPABASE_STORAGE_BUCKET);

  await ensureBucket();

  const files = await collectFiles(dataRoot);
  if (!files.length) {
    throw new Error(`No files found under ${dataRoot}`);
  }

  console.log(`Uploading ${files.length} data files to supabase://${SUPABASE_STORAGE_BUCKET}/${SUPABASE_STORAGE_PREFIX}`);
  for (const localFile of files) {
    const result = await uploadFile(localFile);
    if (result.skipped) {
      console.log(`Skipped ${result.objectPath} (${result.reason})`);
      continue;
    }
    console.log(`Uploaded ${result.objectPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
