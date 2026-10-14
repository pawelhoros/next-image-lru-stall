import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const CACHE_DIR = path.join(".next", "cache", "images");
const FILLER_ENTRIES = Number(process.env.FILLER_ENTRIES ?? 4500);
const FILLER_BYTES = Number(process.env.FILLER_BYTES ?? 57_000);
const PARALLEL = 10;
const IMAGE = "/_next/image?url=%2Fphoto.png&w=384&q=75";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startServer() {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 300; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return child;
    } catch {}
    await sleep(100);
  }
  throw new Error("server did not start");
}

function stopServer(child) {
  process.kill(-child.pid, "SIGTERM");
  return sleep(500);
}

async function requestImages() {
  const started = performance.now();
  return Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      const res = await fetch(`${BASE}${IMAGE}`, {
        headers: { accept: "image/avif,image/webp,*/*" },
      });
      await res.arrayBuffer();
      return {
        ms: Math.round(performance.now() - started),
        cache: res.headers.get("x-nextjs-cache"),
      };
    })
  );
}

async function addFillerEntries() {
  const expireAt = Date.now() + 365 * 24 * 3600 * 1000;
  for (let i = 0; i < FILLER_ENTRIES; i++) {
    const dir = path.join(CACHE_DIR, `filler${i}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `31536000.${expireAt}.etag${i}.upstream.webp`),
      randomBytes(FILLER_BYTES)
    );
  }
}

async function removeFillerEntries() {
  for (const name of await fs.readdir(CACHE_DIR)) {
    if (name.startsWith("filler")) {
      await fs.rm(path.join(CACHE_DIR, name), { recursive: true, force: true });
    }
  }
}

async function measure(label) {
  const server = await startServer();
  const results = await requestImages();
  await stopServer(server);
  const times = results.map((r) => r.ms);
  console.log(
    `${label}: first ${PARALLEL} parallel image requests after start took ` +
      `${Math.min(...times)}-${Math.max(...times)} ms, x-nextjs-cache: ` +
      [...new Set(results.map((r) => r.cache))].join(",")
  );
}

await fs.rm(CACHE_DIR, { recursive: true, force: true });

const seed = await startServer();
await requestImages();
await stopServer(seed);

await measure("cache with 1 entry       ");

await addFillerEntries();
const total = (FILLER_ENTRIES * FILLER_BYTES) / 1e6;
await measure(`cache with ${FILLER_ENTRIES + 1} entries (${total.toFixed(0)} MB)`);

await removeFillerEntries();
