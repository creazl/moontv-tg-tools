import { HTML_ADMIN } from "./admin.js";

// mtv-tg：Telegram 公开频道资源聚合（轻量版）
// 频道列表存 Workers KV，抓 t.me/s/<频道> 预览页，解析文字/磁力/网盘链接
const KEY = "tg:channels";
const KEY_API = "tg:apiBase";
const KEY_APITOK = "tg:apiTok";
const ADMIN_TOKEN = (env) => (env && env.TG_ADMIN_TOKEN) || "CHANGE_ME_TOKEN";

let LAST_ERR = "";
async function getChannels(env) {
  try { const j = await env.TG_KV.get(KEY, "json"); return Array.isArray(j) ? j : []; }
  catch (e) { LAST_ERR = e.message; return []; }
}
async function setChannels(env, list) {
  try { await env.TG_KV.put(KEY, JSON.stringify(list)); return true; }
  catch (e) { LAST_ERR = e.message; return false; }
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// 解析 t.me 预览页
function parsePage(html, channel) {
  const posts = [];
  const blocks = html.split('<div class="tgme_widget_message ').slice(1);
  for (const b of blocks) {
    const post = (b.match(/data-post="([^"]+)"/) || [])[1] || "";
    const id = post.split("/")[1] || "";
    const time = (b.match(/<time datetime="([^"]+)"/) || [])[1] || "";
    let text = "";
    const tm = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (tm) {
      text = tm[1]
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }
    const magnets = [];
    const links = [];
    const re = /href="([^"]+)"[^>]*>([^<]{0,60})/g;
    let m;
    while ((m = re.exec(b))) {
      const href = m[1];
      if (href.startsWith("magnet:")) magnets.push(href);
      else if (/https?:\/\/.+/.test(href) && !href.includes("t.me/")) links.push({ url: href, label: m[2].trim() });
    }
    const texts = text.match(/magnet:\?xt=urn:btih:[A-Za-z0-9]+/g) || [];
    for (const t of texts) if (!magnets.includes(t)) magnets.push(t);
    const pan = [];
    for (const p of ["pan.quark.cn", "pan.baidu.com", "aliyundrive.com", "alipan.com", "115.com", "123pan.com", "pan.xunlei.com", "caiyun.139.com"]) {
      const re2 = new RegExp(`https?://[^\\s"'<>]*${p.replace(/\./g, "\\.")}[^\\s"'<>]*`, "g");
      const found = text.match(re2) || [];
      for (const f of found) pan.push(f);
    }
    if (text || magnets.length || pan.length) {
      posts.push({ channel, id, time, url: `https://t.me/${channel}/${id}`, text, magnets: [...new Set(magnets)], pan: [...new Set(pan)], links: links.slice(0, 6) });
    }
  }
  return posts;
}

async function fetchChannel(channel, pages = 1, query = "") {
  const out = [];
  let before = "";
  for (let i = 0; i < pages; i++) {
    let u = `https://t.me/s/${channel}`;
    if (query) u += `?q=${encodeURIComponent(query)}`;
    if (before) u += `${query ? "&" : "?"}before=${before}`;
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (compatible; mtv-tg/1.0)" }, cf: { cacheTtl: 60, cacheEverything: true } });
    if (!r.ok) break;
    const html = await r.text();
    const posts = parsePage(html, channel);
    out.push(...posts);
    const ids = posts.map((p) => parseInt(p.id, 10)).filter((n) => n);
    if (!ids.length) break;
    before = String(Math.min(...ids));
  }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,X-Token", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
    if (request.method === "OPTIONS") return new Response("", { headers: cors });
    const json = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...cors } });
    const token = request.headers.get("X-Token") || url.searchParams.get("token") || "";

    if (url.pathname === "/admin" || url.pathname === "/") {
      return new Response(HTML_ADMIN, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, must-revalidate" } });
    }
    if (url.pathname === "/api/channels") {
      if (token !== ADMIN_TOKEN(env)) return json({ error: "口令不对" }, 401);
      if (request.method === "GET") return json({ channels: await getChannels(env) });
      if (request.method === "POST") {
        const body = await request.json().catch(() => ({}));
        const norm = (c) => c.trim().replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "").replace(/\/.*$/, "").replace(/^s\//, "");
        let list = await getChannels(env);
        for (const c of body.add || []) { const n = norm(c); if (n && !list.includes(n)) list.push(n); }
        if (body.remove) list = list.filter((c) => !body.remove.map(norm).includes(c));
        if (body.set) list = body.set.map(norm).filter(Boolean);
        await setChannels(env, list);
        return json({ ok: true, channels: list });
      }
    }
    if (url.pathname === "/api/probe") {
      if (token !== ADMIN_TOKEN(env)) return json({ error: "口令不对" }, 401);
      const raw = (url.searchParams.get("channel") || "").trim();
      const ch = raw.replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "").replace(/\/.*$/, "").replace(/^s\//, "");
      if (!ch) return json({ error: "缺频道名" }, 400);
      try {
        const r = await fetch(`https://t.me/s/${ch}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; mtv-tg/1.0)" }, cf: { cacheTtl: 60, cacheEverything: true } });
        if (!r.ok) return json({ channel: ch, ok: false, count: 0, reason: `频道不存在或无法预览（HTTP ${r.status}）` });
        const html = await r.text();
        const posts = parsePage(html, ch);
        if (posts.length) return json({ channel: ch, ok: true, count: posts.length, reason: "可抓取" });
        return json({ channel: ch, ok: false, count: 0, reason: "网页预览已关闭（频道存在但看不到内容）" });
      } catch (e) {
        return json({ channel: ch, ok: false, count: 0, reason: "抓取失败：" + e.message });
      }
    }
    if (url.pathname === "/api/settings") {
      if (token !== ADMIN_TOKEN(env)) return json({ error: "口令不对" }, 401);
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        if (typeof b.apiBase === "string") await env.TG_KV.put(KEY_API, b.apiBase.trim());
        if (typeof b.apiTok === "string") await env.TG_KV.put(KEY_APITOK, b.apiTok.trim());
      }
      return json({ apiBase: (await env.TG_KV.get(KEY_API)) || "", apiTok: (await env.TG_KV.get(KEY_APITOK)) || "" });
    }
    if (url.pathname === "/api/search") {
      if (token !== ADMIN_TOKEN(env)) return json({ error: "口令不对" }, 401);
      const t0 = Date.now();
      const q = (url.searchParams.get("q") || "").trim();
      const only = url.searchParams.get("only") || "";
      const pages = Math.min(Math.max(parseInt(url.searchParams.get("pages") || "2", 10) || 2, 1), 5);
      let list = await getChannels(env);
      if (only) list = [only.replace(/^https?:\/\/t\.me\//, "").replace(/^@/, "").replace(/\/.*$/, "")];
      if (!list.length) return json({ total: 0, items: [], ms: 0, hint: "还没配频道" });
      const apiBase = (await env.TG_KV.get(KEY_API)) || "";
      const apiTok = (await env.TG_KV.get(KEY_APITOK)) || "";
      const results = await Promise.allSettled(list.map((c) => fetchChannel(c, pages)));
      let items = [];
      const failed = [];
      results.forEach((r, i) => { if (r.status === "fulfilled") items.push(...r.value); else failed.push(list[i]); });
      if (q) {
        const low = q.toLowerCase();
        items = items.filter((x) => (x.text || "").toLowerCase().includes(low) || x.magnets.join(" ").includes(q));
      }
      if (apiBase) {
        try {
          const u = `${apiBase.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&channels=${encodeURIComponent(list.join(","))}&limit=50`;
          const r = await fetch(u, { headers: apiTok ? { "X-Token": apiTok } : {} });
          if (r.ok) {
            const j = await r.json();
            for (const it of j.items || []) items.push({ ...it, via: "mtproto" });
            items = items.filter((x, i, arr) => arr.findIndex((y) => y.id === x.id && y.channel === x.channel && y.via === x.via) === i);
          }
        } catch (e) { failed.push("mtproto:" + e.message); }
      }
      items.sort((a, b) => (b.time || "").localeCompare(a.time || ""));
      return json({ total: items.length, items: items.slice(0, 60), failed, ms: Date.now() - t0 });
    }
    if (url.pathname === "/health") {
      const list = await getChannels(env);
      return json({ ok: true, channels: list.length, lastErr: LAST_ERR, up: "kv" });
    }
    return new Response("mtv-tg: /admin 管理台 · /api/search?q= · /health", { status: 404, headers: cors });
  },
};
