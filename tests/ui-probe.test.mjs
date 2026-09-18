// What the wrapper is worth, measured rather than argued.
//
// The probe renders the same list twice: once with the count in a reference the
// counter subscribes to, and once with the count in the root's state. The test
// counts how many components each update re-renders, and hydrates a server
// rendered document so a mismatch between the two sides cannot pass unnoticed.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createServer } from "node:http"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const probeRoot = path.join(repositoryRoot, "tests", "fixtures", "ui-probe")
const documentRoot = path.join(probeRoot, "dist", "client")

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
}

const buildProbe = () => {
  const result = spawnSync(
    process.execPath,
    [path.join(probeRoot, "build.mjs")],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  )

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

const serve = async root => {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1")
      let file = path.join(root, decodeURIComponent(url.pathname))

      if (url.pathname.endsWith("/")) {
        file = path.join(file, "index.html")
      }

      const body = await fs.readFile(file)

      response.writeHead(200, {
        "content-type":
          contentTypes[path.extname(file)] ?? "application/octet-stream",
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

const clickAndSettle = async (page, variant) => {
  await page.evaluate(() => window.uiProbe.reset())
  await page.click(`#${variant} button`)

  // The document is server rendered, so a click only counts once hydration has
  // attached the handler. Waiting for the value to change waits for that.
  await page.waitForFunction(
    selector =>
      document.querySelector(`${selector} .value`).textContent === "1",
    `#${variant}`,
    { timeout: 5000 },
  )

  return page.evaluate(() => window.uiProbe.summary())
}

test("a subscribed update re-renders one component where a root update re-renders all of them", async () => {
  buildProbe()

  const { origin, server } = await serve(documentRoot)
  const { chromium } = await import("playwright-core")
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    const problems = []

    page.on("console", message => {
      if (message.type() === "error" || message.type() === "warning") {
        problems.push(`${message.type()}: ${message.text()}`)
      }
    })
    page.on("pageerror", error => problems.push(`pageerror: ${error.message}`))

    const response = await page.goto(`${origin}/`, { waitUntil: "load" })

    assert.equal(response.status(), 200)

    // The server rendered document is the document, so the counter starts at
    // zero without the client having rendered anything.
    const serverValue = await page.textContent("#store .value")

    assert.equal(serverValue, "0")

    const store = await clickAndSettle(page, "store")

    assert.equal(store["store-counter"], 1, "the subscribed counter re-renders")
    assert.equal(store["store-items"], undefined, "no item re-renders")
    assert.equal(
      store["store-root"],
      undefined,
      "the tree above does not re-render",
    )

    const naive = await clickAndSettle(page, "naive")

    assert.equal(naive["naive-counter"], 1)
    assert.equal(naive["naive-items"], 40, "every item re-renders")
    assert.equal(naive["naive-root"], 1)

    assert.deepEqual(problems, [], "hydration or render problems")
  } finally {
    await browser.close()
    server.close()
  }
})
