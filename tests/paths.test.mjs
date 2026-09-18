// The path rules the engine inherited, asserted against the compiled module
// rather than against the JavaScript source they replaced.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const engine = async () => {
  const build = spawnSync(
    path.join(repositoryRoot, "node_modules", ".bin", "eliscript-build"),
    ["--config", "eliscript.json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  )

  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`)

  return import(
    pathToFileURL(
      path.join(repositoryRoot, "dist", "engine", "support", "paths.mjs"),
    ).href
  )
}

test("normalizes URL base paths", async () => {
  const { normalize_base_path: normalize } = await engine()

  assert.equal(normalize(""), "/")
  assert.equal(normalize("project"), "/project/")
  assert.equal(normalize("/project/"), "/project/")
})

test("adds and removes URL base paths", async () => {
  const { strip_base_path: strip, with_base_path: add } = await engine()

  assert.equal(add("/post/", "/project/"), "/project/post/")
  assert.equal(add("assets/app.js", "/project/"), "/project/assets/app.js")
  assert.equal(add("https://example.com", "/project/"), "https://example.com")
  assert.equal(strip("/project/post/", "/project/"), "/post/")
  assert.equal(strip("/project", "/project/"), "/")
})
