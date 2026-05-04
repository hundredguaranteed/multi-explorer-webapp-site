const CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

function json(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

function normalizeSegments(rawPath) {
  return String(rawPath || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => segment !== "." && segment !== "..");
}

function buildSupabaseObjectUrl(env, objectPath) {
  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const bucket = String(env.SUPABASE_STORAGE_BUCKET || "").trim();
  const prefix = normalizeSegments(env.SUPABASE_STORAGE_PREFIX).join("/");
  if (!baseUrl || !bucket) return "";
  const key = [prefix, ...normalizeSegments(objectPath)].filter(Boolean).join("/");
  return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function onRequestGet(context) {
  const requestedPath = Array.isArray(context.params?.path)
    ? context.params.path.join("/")
    : String(context.params?.path || "");
  const objectPath = normalizeSegments(requestedPath).join("/");
  if (!objectPath) {
    return json({ error: "Missing data object path." }, { status: 400 });
  }

  const upstreamUrl = buildSupabaseObjectUrl(context.env, objectPath);
  if (!upstreamUrl) {
    return json(
      {
        error: "Supabase storage is not configured.",
        required: ["SUPABASE_URL", "SUPABASE_STORAGE_BUCKET"],
      },
      { status: 500 },
    );
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    cf: {
      cacheEverything: true,
      cacheTtl: 86400,
    },
    headers: {
      "accept-encoding": "gzip, br",
    },
  });

  if (!upstreamResponse.ok) {
    return json(
      {
        error: "Supabase storage fetch failed.",
        path: objectPath,
        status: upstreamResponse.status,
      },
      { status: upstreamResponse.status },
    );
  }

  const headers = new Headers(upstreamResponse.headers);
  headers.set("cache-control", CACHE_CONTROL);
  headers.set("access-control-allow-origin", "*");
  headers.set("x-data-source", "supabase-storage");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}
