function json(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function onRequestGet(context) {
  return json({
    ok: true,
    stack: "cloudflare-pages+supabase-storage",
    hasSupabaseUrl: Boolean(context.env.SUPABASE_URL),
    hasBucket: Boolean(context.env.SUPABASE_STORAGE_BUCKET),
    storagePrefix: String(context.env.SUPABASE_STORAGE_PREFIX || ""),
  });
}
