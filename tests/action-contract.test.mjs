// The Action contract, tested where it can be tested.
//
// A real runner is not available here, so this exercises the entry point a
// runner would execute: environment variables in, GITHUB_OUTPUT out. It does
// not claim that a workflow ran; it claims the program behind the workflow
// keeps the published names and meaning of every input and output.

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { parse as parseYaml } from "yaml"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const hasBun = () => {
  const result = spawnSync("bun", ["--version"], { encoding: "utf8" })

  return result.status === 0
}

const buildEngine = () => {
  const result = spawnSync(
    path.join(repositoryRoot, "node_modules", ".bin", "eliscript-build"),
    ["--config", "eliscript.json"],
    { cwd: repositoryRoot, encoding: "utf8" },
  )

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
}

const workspaceCopy = async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), "saos-action-"))

  await fs.cp(path.join(repositoryRoot, "examples", "basic"), target, {
    recursive: true,
    filter: source =>
      path.basename(source) !== "dist" && path.basename(source) !== ".DS_Store",
  })

  return target
}

const walkTree = async root => {
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
      } else {
        found.push(next)
      }
    }
  }

  return found.sort()
}

const treeDigest = async root => {
  const files = await walkTree(root)
  const parts = []

  for (const file of files) {
    const bytes = await fs.readFile(path.join(root, file))

    parts.push(
      `${file}:${bytes.length}:${bytes.toString("base64").slice(0, 24)}`,
    )
  }

  return parts.join("\n")
}

const runAction = (workspaceRoot, environment) => {
  const outputs = path.join(
    workspaceRoot,
    `outputs-${Math.random().toString(36).slice(2)}.txt`,
  )

  const entry =
    environment.SAOS_ACTION_ENTRY ??
    path.join(repositoryRoot, "dist", "engine", "action", "main.mjs")

  const result = spawnSync(process.execPath, [entry], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ACTION_PATH: repositoryRoot,
      GITHUB_OUTPUT: outputs,
      SAOS_WORKSPACE: workspaceRoot,
      SAOS_CONTENT: undefined,
      SAOS_CONFIG: undefined,
      SAOS_PUBLIC: undefined,
      SAOS_OUTPUT: undefined,
      SAOS_BASE: undefined,
      ...environment,
    },
  })

  return { outputs, result }
}

const readOutputs = async file => {
  const text = await fs.readFile(file, "utf8")
  const values = {}

  for (const line of text.split("\n")) {
    const separator = line.indexOf("=")

    if (separator > 0) {
      values[line.slice(0, separator)] = line.slice(separator + 1)
    }
  }

  return values
}

test("publishes output-path and post-count for a configured output", async () => {
  buildEngine()
  const workspace = await workspaceCopy()
  const { outputs, result } = runAction(workspace, {
    SAOS_OUTPUT: "site",
    SAOS_BASE: "/journal/",
  })

  assert.equal(result.status, 0, result.stderr)

  const values = await readOutputs(outputs)

  assert.equal(values["output-path"], path.join(workspace, "site"))
  assert.equal(values["post-count"], "2")

  // The output path is a real tree, not a name the program invented.
  const built = await fs.readdir(path.join(workspace, "site"))

  assert.ok(built.includes("assets"))
  assert.ok(built.includes("rss.xml"))

  await fs.rm(workspace, { recursive: true, force: true })
})

test("uses the published defaults when a workflow sets nothing", async () => {
  buildEngine()
  const workspace = await workspaceCopy()
  const { outputs, result } = runAction(workspace, {})

  assert.equal(result.status, 0, result.stderr)

  const values = await readOutputs(outputs)

  assert.equal(values["output-path"], path.join(workspace, "dist"))
  assert.equal(values["post-count"], "2")

  await fs.rm(workspace, { recursive: true, force: true })
})

test("reads the content, config and public paths a workflow passes", async () => {
  // This is the shape the repository's own workflow uses: the workspace is the
  // checkout root and every content path points into the example. A default
  // that ignored the passed value would still build, from the wrong
  // directory, which is what happened before this test existed.
  buildEngine()
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "saos-paths-"))
  const { outputs, result } = runAction(repositoryRoot, {
    SAOS_CONFIG: "examples/basic/saos.config.mjs",
    SAOS_CONTENT: "examples/basic/content/blog",
    SAOS_OUTPUT: output,
    SAOS_PUBLIC: "examples/basic/static",
  })

  assert.equal(result.status, 0, result.stderr)

  const values = await readOutputs(outputs)

  assert.equal(values["post-count"], "2")
  assert.equal(values["output-path"], output)

  const produced = await fs.readdir(output)

  assert.ok(produced.includes("hello"))
  assert.ok(
    produced.includes("robots.txt"),
    "the public directory came through",
  )

  await fs.rm(output, { recursive: true, force: true })
})

test("fails loudly instead of publishing a wrong site", async () => {
  buildEngine()
  const workspace = await workspaceCopy()

  await fs.writeFile(
    path.join(workspace, "content", "blog", "broken.md"),
    "---\ntitle: Broken\n---\n\nNo date.\n",
  )

  const { outputs, result } = runAction(workspace, {})

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /frontmatter field "date" is required/)
  await assert.rejects(fs.readFile(outputs, "utf8"))

  await fs.rm(workspace, { recursive: true, force: true })
})

test(
  "the packaged entry point produces the same tree as the compiled one",
  { skip: hasBun() ? false : "bun is not installed" },
  async () => {
    buildEngine()

    const packaged = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "dist", "engine", "tools", "package.mjs"),
        "--root",
        repositoryRoot,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    )

    assert.equal(packaged.status, 0, packaged.stderr)

    const compiled = await workspaceCopy()
    const bundled = await workspaceCopy()

    const first = runAction(compiled, {
      SAOS_OUTPUT: "site",
      SAOS_BASE: "/journal/",
      SAOS_ACTION_ENTRY: path.join(
        repositoryRoot,
        "dist",
        "engine",
        "action",
        "main.mjs",
      ),
    })
    const second = runAction(bundled, {
      SAOS_OUTPUT: "site",
      SAOS_BASE: "/journal/",
      SAOS_ACTION_ENTRY: path.join(
        repositoryRoot,
        "dist",
        "action",
        "index.mjs",
      ),
    })

    assert.equal(first.result.status, 0, first.result.stderr)
    assert.equal(second.result.status, 0, second.result.stderr)

    const [left, right] = await Promise.all([
      treeDigest(path.join(compiled, "site")),
      treeDigest(path.join(bundled, "site")),
    ])

    assert.equal(left, right)
    assert.ok(left.length > 0)

    await Promise.all([
      fs.rm(compiled, { recursive: true, force: true }),
      fs.rm(bundled, { recursive: true, force: true }),
    ])
  },
)

test("declares the published action contract", async () => {
  const metadata = parseYaml(
    await fs.readFile(path.join(repositoryRoot, "action.yml"), "utf8"),
  )

  assert.equal(metadata.name, "SAOS Blog")
  assert.equal(metadata.runs.using, "composite")

  // The inputs a workflow already passes, with the defaults it already relies
  // on. The engine changed; none of these did.
  const inputs = {
    base: "",
    config: "saos.config.mjs",
    content: "content/blog",
    output: "dist",
    public: "static",
  }

  for (const [name, value] of Object.entries(inputs)) {
    assert.equal(metadata.inputs[name].required, false, name)
    assert.equal(metadata.inputs[name].default, value, name)
  }

  // The engine needs a newer Node than the previous one did. The input keeps
  // its name and its meaning; only the version a workflow gets by default
  // moved.
  assert.equal(metadata.inputs["node-version"].default, "24")

  for (const name of ["output-path", "post-count"]) {
    assert.equal(
      metadata.outputs[name].value,
      `\${{ steps.build.outputs.${name} }}`,
      name,
    )
  }

  // The step that runs is the engine's Action entry, not the removed script.
  const run = metadata.runs.steps.find(step => step.id === "build")

  assert.match(run.run, /dist\/engine\/action\/main\.mjs/)
})
