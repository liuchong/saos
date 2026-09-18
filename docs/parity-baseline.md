# Parity Baseline

The Eliscript engine swap is judged against numbers, not impressions. This file
freezes what the current JavaScript engine does, so every later stage compares
against the same definitions.

## How To Reproduce

```sh
node tools/baseline.mjs              # human-readable report
node tools/baseline.mjs --json       # machine-readable copy
node tools/baseline.mjs --no-browser # build and artifact metrics only
node tools/baseline.mjs --runs 5     # more samples
```

The tool writes nothing into the repository. It builds into a temporary
directory, discards two warm-up builds, then measures. It exits non-zero if any
same-origin request fails during a browser measurement, because a page whose
assets do not resolve is not a fast page.

## Definitions

| Metric                         | Definition                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `buildMs`                      | Median wall time of a full build into an empty output directory, after two discarded warm-up builds                                                                |
| `outputBytes`                  | Total size of the emitted tree, including fonts                                                                                                                    |
| `jsBytes` / `jsGzipBytes`      | Size of emitted `.js` files, raw and gzipped                                                                                                                       |
| `cssBytes` / `cssGzipBytes`    | Size of emitted `.css` files, raw and gzipped                                                                                                                      |
| page `bytes`                   | Size of each emitted HTML file                                                                                                                                     |
| `fcp`                          | First Contentful Paint, from navigation start                                                                                                                      |
| `load`                         | `loadEventEnd`, from navigation start                                                                                                                              |
| `settle`                       | Navigation start until three animation frames after the `load` event. A proxy for "the page stopped working on load"; **not** a React-internal hydration timestamp |
| `blockingMs`                   | Total Blocking Time: the portion of each long task past 50 ms                                                                                                      |
| `maxLongTaskMs`                | Longest single long task                                                                                                                                           |
| `assetRequests` / `assetBytes` | Same-origin script and stylesheet requests, and their decoded size                                                                                                 |

Browser numbers are the median of three navigations per page.

## Recorded Baseline

- Date: 2026-09-18
- Source: `master` at `4e906c0`, before the M0 commit
- Environment: macOS arm64, Node `v26.8.2`, `chromium 153.0.8010.12`
- Workspace: `examples/basic` (2 posts, base path `/journal/`)

| Metric               | Value                 |
| -------------------- | --------------------- |
| `buildMs` (median)   | 66.46 ms              |
| `buildMs` (runs)     | 88.04, 66.46, 66.12   |
| `outputBytes`        | 432,945 B in 26 files |
| `jsBytes`            | 145,335 B in 1 file   |
| `jsGzipBytes`        | 46,912 B              |
| `cssBytes`           | 12,210 B              |
| `cssGzipBytes`       | 3,235 B               |
| Other assets (fonts) | 260,078 B             |

| Page           | Bytes |
| -------------- | ----- |
| `/`            | 3,328 |
| `/hello/`      | 3,370 |
| `/expressive/` | 3,262 |
| `/404/`        | 2,122 |
| `/404.html`    | 2,122 |

| Page (served)          | `fcp` | `load` | `settle` | `blockingMs` | `maxLongTaskMs` | `assetRequests` | `assetBytes` |
| ---------------------- | ----- | ------ | -------- | ------------ | --------------- | --------------- | ------------ |
| `/journal/`            | 16    | 14.0   | 53.8     | 0            | 0               | 2               | 157,545      |
| `/journal/hello/`      | 16    | 14.2   | 53.6     | 0            | 0               | 2               | 157,545      |
| `/journal/expressive/` | 16    | 14.6   | 53.3     | 0            | 0               | 2               | 157,545      |
| `/journal/404/`        | 12    | 12.3   | 53.4     | 0            | 0               | 2               | 157,545      |
| `/journal/404.html`    | 12    | 12.6   | 53.5     | 0            | 0               | 2               | 157,545      |

## Limitations

These are recorded because a later comparison that ignores them would be
misleading.

1. **`settle` has a floor of about 50 ms.** Three animation frames at 60 Hz cost
   roughly 50 ms on their own, and every page reports 53-56 ms. It can show a
   large regression and only a small improvement. It is a coarse instrument.
2. **There is no interaction baseline.** No page produces a single long task, so
   there is nothing on a SAOS page today whose interaction latency could be
   measured: the client hydrates a static document and then does nothing. The
   original plan expected an interaction-latency baseline for the comments page;
   that expectation does not hold, because comments are rendered by a
   third-party script and require the network. M5's comparison must therefore
   use a probe that carries real client state, and no SAOS-wide claim may be
   derived from that probe.
3. **`buildMs` is a warm-cache number.** Vite's dependency optimization makes the
   first build several times slower. Both engines are compared warm, in the same
   process shape.
4. **Assets dominate the transfer, not JavaScript.** 260 kB of self-hosted fonts
   against 47 kB of gzipped JavaScript. A change that only moves JavaScript will
   look small in transfer terms.
5. **One platform.** macOS arm64 with a single Chromium build. No Linux cells.

## Measurement Note

The first version of this harness served the output tree at the server root
while the site declares `basePath: "/journal/"`. Both the stylesheet and the
script 404'd, and the broken pages reported a 300-byte asset payload - a number
that looked like a very fast page. The harness now mounts the tree at the
configured base path and fails a run that sees any failed same-origin request.
Any baseline recorded before this correction was meaningless.
