// POST /api/submit  { firstName, lastName, email }
// Called by the download form. The browser never waits on this (the PDF download starts
// regardless), so every failure here is quiet for the visitor but returns a real status.
"use strict";
const { sql, ensureSchema, ipHash } = require("./_lib");

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 4096;
const RATE_LIMIT = 30;          // submissions per IP hash per 10 minutes
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

function clean(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false }); }

  // Same-origin only: the form is served from this very site.
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch (e) { /* falls through to the check below */ }
    if (host !== req.headers.host) return res.status(403).json({ ok: false });
  }
  if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) return res.status(415).json({ ok: false });

  let body;
  try { body = await readBody(req); } catch (e) { return res.status(400).json({ ok: false }); }
  if (!body || typeof body !== "object") return res.status(400).json({ ok: false });

  const firstName = clean(body.firstName, 100);
  const lastName = clean(body.lastName, 100);
  const email = clean(body.email, 254);
  if (!firstName || !lastName || !EMAIL.test(email)) return res.status(400).json({ ok: false });

  try {
    await ensureSchema();
    const q = sql();
    const hash = ipHash(req);
    const recent = await q.query(
      `SELECT count(*)::int AS n FROM report_downloads WHERE ip_hash = $1 AND last_seen_at > now() - interval '10 minutes'`,
      [hash]);
    if (recent[0].n >= RATE_LIMIT) return res.status(429).json({ ok: false });

    await q.query(
      `INSERT INTO report_downloads (first_name, last_name, email, email_key, ip_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email_key) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         download_count = report_downloads.download_count + 1,
         last_seen_at = now(),
         ip_hash = EXCLUDED.ip_hash`,
      [firstName, lastName, email, email.toLowerCase(), hash]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("submit failed:", e && e.message);
    return res.status(500).json({ ok: false });
  }
};
