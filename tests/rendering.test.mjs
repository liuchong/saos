// The rendering corpus, checked against recorded output.
//
// The corpus covers the features the engine has to keep working: tables,
// highlighted and unknown-language code, raw HTML, task lists, footnotes, CJK
// and emoji, an empty body, a draft, an MDX expression, and a direct `.mdx`
// file. `expected/` holds the documents the engine produced when the
// JavaScript engine still agreed with it, with content hashes normalized so a
// rebuilt asset does not fail the comparison.
//
// `expected-markers.json` is what keeps the comparison honest: every listed
// feature must appear in the output, so a document that renders nothing cannot
// pass.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const corpus = path.join(repositoryRoot, "tests", "fixtures", "corpus")

const build = () => {
  const engine = spawnSync(
    path.join(repositoryRoot, "node_modules", ".bin", "eliscript-build"),
    ["--config", "eliscript.json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  )

  assert.equal(engine.status, 0, `${engine.stdout}\n${engine.stderr}`)
}

const withoutHashes = text =>
  text.replace(
    /-[A-Za-z0-9_-]{8}\.(js|css|woff2?|png|ico|svg|avif|webp)/g,
    "-CONTENTHASH.$1",
  )

const walk = async root => {
  const found = []
  const pending = [""]

  while (pending.length > 0) {
    const relative = pending.pop()
    const absolute = relative ? path.join(root, relative) : root

    for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
      const next = relative ? path.join(relative, entry.name) : entry.name

      if (entry.isDirectory()) {
        pending.push(next)
      } else if (entry.name.endsWith(".html")) {
        found.push(next)
      }
    }
  }

  return found.sort()
}

test("the corpus renders what it rendered before", async () => {
  build()

  const output = await fs.mkdtemp(path.join(os.tmpdir(), "saos-render-"))

  try {
    const run = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "dist", "engine", "builder", "main.mjs"),
        "--workspace",
        corpus,
        "--output",
        output,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    )

    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)

    const expected = await walk(path.join(corpus, "expected"))
    const produced = await walk(output)

    assert.deepEqual(produced, expected, "the same documents are produced")

    let rendered = ""

    for (const file of expected) {
      const [left, right] = await Promise.all([
        fs.readFile(path.join(corpus, "expected", file), "utf8"),
        fs.readFile(path.join(output, file), "utf8"),
      ])

      rendered += `${right}\n`

      assert.equal(withoutHashes(right), left, file)
    }

    // The draft is not published, and the 404 alias is a copy rather than a
    // second render.
    const [notFound, alias] = await Promise.all([
      fs.readFile(path.join(output, "404", "index.html"), "utf8"),
      fs.readFile(path.join(output, "404.html"), "utf8"),
    ])

    assert.equal(alias, notFound)
    assert.ok(!produced.some(file => file.startsWith("draft/")))

    const markers = JSON.parse(
      await fs.readFile(path.join(corpus, "expected-markers.json"), "utf8"),
    )
    const missing = markers.filter(marker => !rendered.includes(marker))

    assert.deepEqual(missing, [], "every covered feature is present")
  } finally {
    await fs.rm(output, { recursive: true, force: true })
  }
})
