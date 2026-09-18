// The built site, in a browser.
//
// The parity check compares documents; this checks that the documents work:
// every page loads without a console error, the client script hydrates them,
// and every internal link resolves.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
}

const buildSite = async () => {
  const build = spawnSync(
    path.join(repositoryRoot, "node_modules", ".bin", "eliscript-build"),
    ["--config", "eliscript.json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  )

  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`)

  const output = await fs.mkdtemp(path.join(os.tmpdir(), "saos-site-"))
  const run = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "dist", "engine", "builder", "main.mjs"),
      "--workspace",
      path.join(repositoryRoot, "examples", "basic"),
      "--output",
      output,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  )

  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)

  return { output, basePath: "/journal/" }
}

const serve = async (root, basePath) => {
  const prefix = basePath === "/" ? "" : basePath.slice(0, -1)

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1")
      const decoded = decodeURIComponent(url.pathname)

      if (prefix && !decoded.startsWith(prefix)) {
        throw new Error(`outside the base path: ${decoded}`)
      }

      let relative = prefix ? decoded.slice(prefix.length) : decoded

      if (relative === "" || relative.endsWith("/")) {
        relative = `${relative}index.html`
      }

      const body = await fs.readFile(path.join(root, relative))

      response.writeHead(200, {
        "content-type":
          contentTypes[path.extname(relative)] ?? "application/octet-stream",
        "content-length": body.length,
      })
      response.end(body)
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      response.end("not found")
    }
  })

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))

  return { server, origin: `http://127.0.0.1:${server.address().port}` }
}

test("every built page loads, hydrates and resolves its links", async () => {
  const { basePath, output } = await buildSite()
  const { origin, server } = await serve(output, basePath)
  const { chromium } = await import("playwright-core")
  const browser = await chromium.launch()

  try {
    const pages = ["/", "/hello/", "/expressive/", "/404/"]
    const problems = []
    const context = await browser.newContext()
    const page = await context.newPage()

    page.on("console", message => {
      if (message.type() === "error" || message.type() === "warning") {
        problems.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on("pageerror", error => problems.push(`pageerror: ${error.message}`))

    for (const target of pages) {
      const response = await page.goto(
        `${origin}${basePath.slice(0, -1)}${target}`,
        {
          waitUntil: "load",
        },
      )

      assert.equal(response.status(), 200, target)

      // The client script ran: the page data the engine injected is readable.
      const pageData = await page.evaluate(
        () => typeof window.__SAOS_PAGE_DATA__,
      )

      assert.equal(pageData, "object", target)
    }

    // Every internal link resolves, which is the check the artifact stage
    // could not make before pages existed.
    const linked = await page.evaluate(() =>
      [...document.querySelectorAll("a[href]")]
        .map(anchor => anchor.getAttribute("href"))
        .filter(href => href.startsWith("/")),
    )

    assert.ok(linked.length > 0, "the page has internal links")

    for (const href of new Set(linked)) {
      const response = await fetch(`${origin}${href}`)

      assert.equal(response.status, 200, href)
    }

    assert.deepEqual(problems, [])
  } finally {
    await browser.close()
    server.close()
    await fs.rm(output, { recursive: true, force: true })
  }
})
