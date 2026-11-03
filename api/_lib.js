// Shared helpers for the serverless endpoints. (Files starting with "_" are not routes.)
"use strict";
const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

let _sql;
function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

// Created on first use so a cold start never depends on a manual migration step.
let _ready;
function ensureSchema() {
  if (!_ready) {
    _ready = (async () => {
      const q = sql();
      await q.query(`CREATE TABLE IF NOT EXISTS report_downloads (
        id               BIGSERIAL PRIMARY KEY,
        first_name       TEXT        NOT NULL,
        last_name        TEXT        NOT NULL,
        email            TEXT        NOT NULL,
        email_key        TEXT        NOT NULL,
        download_count   INTEGER     NOT NULL DEFAULT 1,
        first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        ip_hash          TEXT
      )`);
      await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS report_downloads_email_key_idx ON report_downloads (email_key)`);
      await q.query(`CREATE TABLE IF NOT EXISTS export_failures (
        id        BIGSERIAL PRIMARY KEY,
        ip_hash   TEXT        NOT NULL,
        at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || (req.socket && req.socket.remoteAddress) || "unknown";
}

// Raw IPs are never stored: only a salted hash, used for rate limiting.
function ipHash(req) {
  // IP_HASH_SALT if set; otherwise derived from the database secret (never empty).
  const salt = process.env.IP_HASH_SALT || crypto.createHash("sha256").update(String(process.env.DATABASE_URL)).digest("hex");
  return crypto.createHmac("sha256", salt).update(clientIp(req)).digest("hex").slice(0, 32);
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = { sql, ensureSchema, ipHash, safeEqual };
