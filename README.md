# next/image: cache HITs wait for the disk-LRU scan after server start

Minimal reproduction for a `next start` issue: after the server starts, the
first `/_next/image` requests are held until the whole `.next/cache/images`
directory has been scanned to build the disk LRU, even when every request is
a cache HIT.

Tested with `next@16.5.0-canary.10` and `next@16.4.0`.

## Run

```bash
npm install
npm run build
node repro.mjs
```

`repro.mjs`:

1. Starts `next start`, requests `/photo.png` through `/_next/image` once so it
   is cached, stops the server.
2. Starts the server again and sends 10 parallel requests for the same image.
3. Adds 4500 filler entries of 57 KB to `.next/cache/images` (about the size of
   a cache that has been persisted across deploys), restarts and measures again.
4. Removes the filler entries.

Size can be changed with `FILLER_ENTRIES` and `FILLER_BYTES`.

## Result (MacBook, SSD, files in OS page cache)

```
cache with 1 entry       : first 10 parallel image requests after start took 14-15 ms, x-nextjs-cache: HIT
cache with 4501 entries (257 MB): first 10 parallel image requests after start took 421-422 ms, x-nextjs-cache: HIT
```

All requests finish at the same moment and all are HITs. The delay grows with
the size of the cache directory and with disk speed: on a production Docker
host with a bind-mounted cache of 4480 entries / 251 MB the same stall was
about 12 s.
