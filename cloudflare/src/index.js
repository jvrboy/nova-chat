const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const authorized = (request, env) => {
  const expected = env.WORKER_TOKEN;
  return Boolean(expected) && request.headers.get("authorization") === `Bearer ${expected}`;
};

const jobKey = (id) => `job:${id}`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "nova-worker", timestamp: new Date().toISOString() });
    if (!authorized(request, env)) return json({ error: "Unauthorized" }, 401);
    if (request.method === "POST" && url.pathname === "/jobs") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.type !== "string" || body.type.length > 128) return json({ error: "type is required" }, 400);
      const id = crypto.randomUUID();
      const record = { id, type: body.type, payload: body.payload ?? null, status: "queued", createdAt: new Date().toISOString() };
      await env.JOB_KV.put(jobKey(id), JSON.stringify(record), { expirationTtl: 86400 });
      return json(record, 202);
    }
    const match = url.pathname.match(/^\/jobs\/([^/]+)$/);
    if (match && request.method === "GET") {
      const record = await env.JOB_KV.get(jobKey(match[1]), "json");
      return record ? json(record) : json({ error: "Job not found" }, 404);
    }
    if (match && request.method === "DELETE") {
      await env.JOB_KV.delete(jobKey(match[1]));
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  },
};
