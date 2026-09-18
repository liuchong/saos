// SAOS baseline harness.
//
// The Eliscript engine swap is only credible against numbers, so this tool
// freezes what the current JavaScript engine does: how long a build takes,
// how many bytes each page and the client bundle weigh, and what a reader's
// browser actually pays for them.
//
// It is a measurement tool, not part of the product. It writes nothing into
// the repository: builds go to a temporary directory, and the numbers are
// printed for a human to record in `docs/parity-baseline.md`.
//
// Usage:
//   node tools/baseline.mjs [--runs 3] [--workspace examples/basic]
//                           [--json] [--no-browser] [--keep]
//
// Every definition this tool uses is repeated in `docs/parity-baseline.md`,
// because a number is only comparable when the way it was taken is fixed.
//
// A page whose assets do not resolve is not a fast page, so a browser run
// that sees a failed same-origin request reports it and exits non-zero.

import fs from "node:fs/promises"
import { createServer } from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

import { buildBlog } from "../scripts/build.mjs"
import { normalizeBasePath } from "../src/path-utils.js"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const contentTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
}

const parseArguments = arguments_ => {
  const options = {
    browser: true,
    json: false,
    keep: false,
    runs: 3,
    warmup: 2,
    workspace: "examples/basic",
  }

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === "--json") {
      options.json = true
    } else if (argument === "--no-browser") {
      options.browser = false
    } else if (argument === "--keep") {
      options.keep = true
    } else if (
      argument === "--runs" ||
      argument === "--warmup" ||
      argument === "--workspace"
    ) {
      const value = arguments_[index + 1]

      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`)
      }

      if (argument === "--runs" || argument === "--warmup") {
        const count = Number(value)

        if (!Number.isInteger(count) || count < 0) {
          throw new Error(
            `${argument} expects a non-negative integer, got ${value}`,
          )
        }

        if (argument === "--runs") {
          if (count < 1) {
            throw new Error(`--runs expects a positive integer, got ${value}`)
          }

          options.runs = count
        } else {
          options.warmup = count
        }
      } else {
        options.workspace = value
      }

      index += 1
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  return options
}

const median = values => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

const round = value => (value === null ? null : Math.round(value * 100) / 100)

const stripBase = (basePath, url) =>
  basePath === "/" ? url : `${basePath.slice(0, -1)}${url}`

// ------------------------------------------------------------------ walking

const walkFiles = async root => {
  const found = []
  const pending = [""]

  while (pending.length > 0) {
    const relative = pending.pop()
    const absolute = relative ? path.join(root, relative) : root
    const entries = await fs.readdir(absolute, { withFileTypes: true })

    for (const entry of entries) {
      const next = relative ? path.join(relative, entry.name) : entry.name

      if (entry.isDirectory()) {
        pending.push(next)
      } else if (entry.isFile()) {
        found.push(next)
      }
    }
  }

  return found.sort()
}

// ------------------------------------------------------------- build metrics

const measureBuild = async ({ runs, warmup, workspace }) => {
  const workspaceRoot = path.resolve(repositoryRoot, workspace)

  // Vite's dependency optimization and the staging directory make the first
  // build far slower than the ones after it. Warm-up builds are discarded so
  // the recorded number describes a warm build, which is what both engines
  // are compared on.
  const build = async label => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "saos-baseline-"))
    const started = process.hrtime.bigint()
    const result = await buildBlog({ workspaceRoot, output: outputDir })
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6

    console.log(`${label}: ${round(elapsed)} ms -> ${result.postCount} post(s)`)

    return { elapsed, outputDir, result }
  }

  for (let index = 0; index < warmup; index += 1) {
    const { outputDir } = await build(`warm-up ${index + 1}/${warmup}`)

    await fs.rm(outputDir, { recursive: true, force: true })
  }

  const timings = []
  let last = null

  for (let index = 0; index < runs; index += 1) {
    const measured = await build(`build ${index + 1}/${runs}`)

    timings.push(measured.elapsed)
    last = measured
  }

  return {
    outputDir: last.outputDir,
    basePath: normalizeBasePath(last.result.site.basePath),
    timings,
  }
}

const collectArtifacts = async outputDir => {
  const files = await walkFiles(outputDir)
  const read = file => fs.readFile(path.join(outputDir, file))
  const size = file =>
    fs.stat(path.join(outputDir, file)).then(stat => stat.size)
  const pageFiles = files.filter(file => file.endsWith(".html"))
  const pages = []

  for (const file of pageFiles) {
    pages.push({
      file,
      url: file === "index.html" ? "/" : `/${file.replace(/index\.html$/, "")}`,
      bytes: await size(file),
    })
  }

  let jsBytes = 0
  let jsGzipBytes = 0
  let jsFiles = 0
  let cssBytes = 0
  let cssGzipBytes = 0
  let assetBytes = 0
  let outputBytes = 0

  for (const file of files) {
    const bytes = await size(file)

    outputBytes += bytes

    if (file.endsWith(".js")) {
      jsBytes += bytes
      jsGzipBytes += gzipSync(await read(file)).length
      jsFiles += 1
    } else if (file.endsWith(".css")) {
      cssBytes += bytes
      cssGzipBytes += gzipSync(await read(file)).length
    } else if (!file.endsWith(".html") && !file.endsWith(".xml")) {
      assetBytes += bytes
    }
  }

  return {
    outputDir,
    fileCount: files.length,
    outputBytes,
    assetBytes,
    cssBytes,
    cssGzipBytes,
    jsBytes,
    jsGzipBytes,
    jsFiles,
    pages: pages.sort((left, right) => left.url.localeCompare(right.url)),
  }
}

// ----------------------------------------------------------- browser metrics

const startStaticServer = async (root, basePath) => {
  const prefix = basePath === "/" ? "" : basePath.slice(0, -1)

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1")
      const decoded = decodeURIComponent(url.pathname)

      if (prefix && !decoded.startsWith(prefix)) {
        throw new Error(`outside the configured base path: ${decoded}`)
      }

      const relative = prefix ? decoded.slice(prefix.length) : decoded
      let file = path.join(root, relative)

      if (relative === "" || relative.endsWith("/")) {
        file = path.join(file, "index.html")
      }

      const body = await fs.readFile(file)
      const type =
        contentTypes[path.extname(file)] || "application/octet-stream"

      response.writeHead(200, {
        "content-type": type,
        "content-length": body.length,
      })
      response.end(body)
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      response.end("not found")
    }
  })

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))

  return { server, port: server.address().port }
}

const instrumentPage = () => {
  window.__saosBaseline = { longTasks: [] }

  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        window.__saosBaseline.longTasks.push({
          start: entry.startTime,
          duration: entry.duration,
        })
      }
    }).observe({ type: "longtask", buffered: true })
  } catch {
    // A browser without longtask sampling still reports the timing metrics.
  }
}

const measurePage = async ({ basePath, browser, origin, target, runs }) => {
  const samples = []
  const failures = []
  const targetUrl = stripBase(basePath, target.url)

  for (let index = 0; index < runs; index += 1) {
    const context = await browser.newContext()
    const page = await context.newPage()

    page.on("response", response => {
      if (response.url().startsWith(origin) && response.status() >= 400) {
        failures.push(
          `${response.status()} ${response.url().slice(origin.length)}`,
        )
      }
    })
    page.on("pageerror", error => failures.push(`pageerror ${error.message}`))
    page.on("requestfailed", request => {
      if (request.url().startsWith(origin)) {
        failures.push(`requestfailed ${request.url().slice(origin.length)}`)
      }
    })

    await page.addInitScript(instrumentPage)
    await page.goto(`${origin}${targetUrl}`, { waitUntil: "load" })

    // `settle` is the proxy for "the page stopped working on load": three
    // animation frames after the load event, measured from navigation start.
    // It is not a React-internal hydration timestamp and is documented as a
    // proxy in docs/parity-baseline.md.
    const settle = await page.evaluate(
      () =>
        new Promise(resolve => {
          let frames = 0

          const tick = () => {
            frames += 1

            if (frames >= 3) {
              resolve(performance.now())
            } else {
              requestAnimationFrame(tick)
            }
          }

          requestAnimationFrame(tick)
        }),
    )

    const measured = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0]
      const paint = performance.getEntriesByName("first-contentful-paint")[0]
      const resources = performance
        .getEntriesByType("resource")
        .filter(
          entry =>
            entry.initiatorType === "script" ||
            entry.initiatorType === "link" ||
            entry.name.endsWith(".js"),
        )
        .map(entry => ({
          name: entry.name,
          bytes: entry.decodedBodySize || entry.transferSize || 0,
        }))
      const longTasks = window.__saosBaseline.longTasks

      return {
        dcl: navigation ? navigation.domContentLoadedEventEnd : null,
        load: navigation ? navigation.loadEventEnd : null,
        fcp: paint ? paint.startTime : null,
        assetRequests: resources.length,
        assetBytes: resources.reduce((total, entry) => total + entry.bytes, 0),
        longTaskCount: longTasks.length,
        maxLongTaskMs: longTasks.reduce(
          (worst, entry) => Math.max(worst, entry.duration),
          0,
        ),
        // Total Blocking Time: the part of each long task past 50 ms.
        blockingMs: longTasks.reduce(
          (total, entry) => total + Math.max(0, entry.duration - 50),
          0,
        ),
      }
    })

    samples.push({ settle, ...measured })
    await context.close()
  }

  const pick = key =>
    median(samples.map(sample => sample[key]).filter(value => value !== null))

  return {
    url: targetUrl,
    samples: samples.length,
    fcp: round(pick("fcp")),
    dcl: round(pick("dcl")),
    load: round(pick("load")),
    settle: round(pick("settle")),
    blockingMs: round(pick("blockingMs")),
    maxLongTaskMs: round(pick("maxLongTaskMs")),
    longTaskCount: round(pick("longTaskCount")),
    assetRequests: round(pick("assetRequests")),
    assetBytes: round(pick("assetBytes")),
    failures: [...new Set(failures)],
  }
}

const measureBrowser = async ({ basePath, pages, outputDir, runs }) => {
  let chromium

  try {
    ;({ chromium } = await import("playwright-core"))
  } catch {
    return {
      status: "skipped",
      reason: "playwright-core is not installed",
      pages: [],
    }
  }

  const { server, port } = await startStaticServer(outputDir, basePath)
  const origin = `http://127.0.0.1:${port}`

  try {
    const browser = await chromium.launch()

    try {
      const measured = []

      for (const target of pages) {
        measured.push(
          await measurePage({ basePath, browser, origin, target, runs }),
        )
      }

      return {
        status: "measured",
        browser: `chromium ${browser.version()}`,
        pages: measured,
      }
    } finally {
      await browser.close()
    }
  } catch (error) {
    return {
      status: "skipped",
      reason: `${error.message}`,
      pages: [],
    }
  } finally {
    server.close()
  }
}

// ------------------------------------------------------------------ reporting

const report = ({ artifacts, browser, buildMs, options, timings }) => {
  const lines = []

  lines.push("")
  lines.push("SAOS baseline")
  lines.push(`  workspace: ${options.workspace}`)
  lines.push(`  node:      ${process.version}`)
  lines.push("")
  lines.push(
    `build (ms)      median ${round(buildMs)}  runs [${timings.map(round).join(", ")}]`,
  )
  lines.push("")
  lines.push(
    `output          ${artifacts.outputBytes} B in ${artifacts.fileCount} files`,
  )
  lines.push(
    `javascript      ${artifacts.jsBytes} B raw / ${artifacts.jsGzipBytes} B gzip in ${artifacts.jsFiles} files`,
  )
  lines.push(
    `css             ${artifacts.cssBytes} B raw / ${artifacts.cssGzipBytes} B gzip`,
  )
  lines.push(`other assets    ${artifacts.assetBytes} B`)
  lines.push("")
  lines.push("pages           bytes")

  for (const page of artifacts.pages) {
    lines.push(`  ${page.url.padEnd(14)}${page.bytes}`)
  }

  if (browser.status === "measured") {
    lines.push("")
    lines.push(`browser         ${browser.browser}`)
    lines.push("")
    lines.push(
      "url                 fcp    load  settle  block  maxtask  reqs  assetbytes",
    )

    for (const page of browser.pages) {
      lines.push(
        `  ${page.url.padEnd(18)}${String(page.fcp).padStart(5)}  ${String(
          page.load,
        ).padStart(5)}  ${String(page.settle).padStart(6)}  ${String(
          page.blockingMs,
        ).padStart(5)}  ${String(page.maxLongTaskMs).padStart(7)}  ${String(
          page.assetRequests,
        ).padStart(4)}  ${String(page.assetBytes).padStart(10)}`,
      )

      for (const failure of page.failures) {
        lines.push(`    FAILED ${failure}`)
      }
    }
  } else {
    lines.push("")
    lines.push(`browser         skipped (${browser.reason})`)
  }

  lines.push("")

  return lines.join("\n")
}

const main = async () => {
  const options = parseArguments(process.argv.slice(2))
  const { basePath, outputDir, timings } = await measureBuild(options)
  const artifacts = await collectArtifacts(outputDir)
  const browser = options.browser
    ? await measureBrowser({
        basePath,
        pages: artifacts.pages,
        outputDir,
        runs: options.runs,
      })
    : { status: "skipped", reason: "--no-browser", pages: [] }
  const failures = browser.pages.flatMap(page => page.failures)

  console.log(
    report({ artifacts, browser, buildMs: median(timings), options, timings }),
  )

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          workspace: options.workspace,
          node: process.version,
          runs: options.runs,
          warmup: options.warmup,
          basePath,
          buildMs: median(timings),
          buildMsRuns: timings,
          artifacts,
          browser,
        },
        null,
        2,
      ),
    )
  }

  if (failures.length > 0) {
    console.error(
      `baseline is not trustworthy: ${failures.length} failed request(s) during measurement`,
    )
    process.exitCode = 1
  }

  if (options.keep) {
    console.log(`output kept at ${outputDir}`)
  } else {
    await fs.rm(outputDir, { recursive: true, force: true })
  }
}

await main()
