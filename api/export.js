// GET /api/export  -> Excel workbook of everyone who downloaded the report.
// Protected by HTTP Basic auth (user "export", password = EXPORT_PASSWORD env var).
// Browsers show a login prompt; the file downloads as soon as it is accepted.
"use strict";
const ExcelJS = require("exceljs");
const { sql, ensureSchema, ipHash, safeEqual } = require("./_lib");

const MAX_FAILURES = 10;        // wrong passwords per IP hash per 15 minutes

function deny(res, status) {
  if (status === 401) res.setHeader("WWW-Authenticate", 'Basic realm="Report downloads export", charset="UTF-8"');
  return res.status(status).send(status === 429 ? "Too many attempts. Try again later." : "Authentication required.");
}

// Stops spreadsheet formula injection: a value beginning with = + - @ is shown as plain text.
function cell(v) {
  const s = String(v == null ? "" : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }

  const expected = process.env.EXPORT_PASSWORD;
  if (!expected || expected.length < 12) return res.status(503).send("Export is not configured.");

  try {
    await ensureSchema();
    const q = sql();
    const hash = ipHash(req);

    const f = await q.query(
      `SELECT count(*)::int AS n FROM export_failures WHERE ip_hash = $1 AND at > now() - interval '15 minutes'`, [hash]);
    if (f[0].n >= MAX_FAILURES) return deny(res, 429);

    const m = /^Basic ([A-Za-z0-9+/=]+)$/.exec(String(req.headers.authorization || ""));
    let user = "", pass = "";
    if (m) {
      const decoded = Buffer.from(m[1], "base64").toString("utf8");
      const i = decoded.indexOf(":");
      user = i < 0 ? decoded : decoded.slice(0, i);
      pass = i < 0 ? "" : decoded.slice(i + 1);
    }
    const ok = !!m && safeEqual(user, "export") && safeEqual(pass, expected);
    if (!ok) {
      if (m) await q.query(`INSERT INTO export_failures (ip_hash) VALUES ($1)`, [hash]);
      return deny(res, 401);
    }

    const rows = await q.query(
      `SELECT first_name, last_name, email, download_count, first_seen_at, last_seen_at
         FROM report_downloads ORDER BY first_seen_at ASC, id ASC`);

    const wb = new ExcelJS.Workbook();
    wb.creator = "State of Innovation";
    const ws = wb.addWorksheet("Report downloads");
    ws.columns = [
      { header: "First name", key: "first", width: 20 },
      { header: "Last name", key: "last", width: 22 },
      { header: "Email", key: "email", width: 36 },
      { header: "Downloads", key: "n", width: 12 },
      { header: "First download (Central)", key: "first_at", width: 26 },
      { header: "Latest download (Central)", key: "last_at", width: 26 },
    ];
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit",
    });
    for (const r of rows) {
      ws.addRow({
        first: cell(r.first_name), last: cell(r.last_name), email: cell(r.email),
        n: r.download_count, first_at: fmt.format(new Date(r.first_seen_at)), last_at: fmt.format(new Date(r.last_seen_at)),
      });
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "F1" };

    const buf = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="report-downloads-${stamp}.xlsx"`);
    return res.status(200).send(Buffer.from(buf));
  } catch (e) {
    console.error("export failed:", e && e.message);
    return res.status(500).send("Export failed.");
  }
};
