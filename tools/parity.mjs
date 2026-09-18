// Model parity between the JavaScript engine and the Eliscript engine.
//
// M1 moves the content model into Eliscript. The claim is only worth anything
// if the two engines produce the same model for the same workspace, so this
// tool runs both and reports every path where they disagree.
//
// It is a test instrument, not part of the product: M7 deletes it, because a
// finished engine does not compare itself to the one it replaced.
//
// Usage:
//   node tools/parity.mjs [--workspace examples/basic] [--include-html]
//                         [--max-differences 20] [--quiet]
//
// The rendered HTML is excluded until M2, where the Markdown and MDX pipeline
// moves across. Every excluded path is counted, so the exclusion cannot widen
// unnoticed.

import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { loadSiteConfig, loadSiteData } from "../scripts/blog-data.mjs"

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)

const parseArguments = arguments_ => {
  const options = {
    maxDifferences: 20,
    quiet: false,
    workspaces: [],
  }

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === "--quiet") {
      options.quiet = true
    } else if (argument === "--workspace" || argument === "--max-differences") {
      const value = arguments_[index + 1]

      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`)
      }

      if (argument === "--workspace") {
        options.workspaces.push(value)
      } else {
        options.maxDifferences = Number(value)
      }

      index += 1
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (options.workspaces.length === 0) {
    options.workspaces = ["examples/basic", "tests/fixtures/parity"]
  }

  return options
}

const describe = value => {
  if (value === undefined) {
    return "undefined"
  }

  if (typeof value === "string") {
    return JSON.stringify(
      value.length > 80 ? `${value.slice(0, 77)}...` : value,
    )
  }

  return JSON.stringify(value)
}

const isPlainObject = value =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const compareInto = (expected, actual, at, differences, options, counters) => {
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const expectedKeys = Object.keys(expected)
    const actualKeys = Object.keys(actual)

    for (const key of expectedKeys) {
      if (!actualKeys.includes(key)) {
        differences.push({
          path: `${at}.${key}`,
          expected: describe(expected[key]),
          actual: "<missing>",
        })
      }
    }

    for (const key of actualKeys) {
      if (!expectedKeys.includes(key)) {
        differences.push({
          path: `${at}.${key}`,
          expected: "<missing>",
          actual: describe(actual[key]),
        })
      }
    }

    for (const key of expectedKeys) {
      if (actualKeys.includes(key)) {
        compareInto(
          expected[key],
          actual[key],
          `${at}.${key}`,
          differences,
          options,
          counters,
        )
      }
    }

    return
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      differences.push({
        path: `${at}.length`,
        expected: expected.length,
        actual: actual.length,
      })
    }

    const shared = Math.min(expected.length, actual.length)

    for (let index = 0; index < shared; index += 1) {
      compareInto(
        expected[index],
        actual[index],
        `${at}[${index}]`,
        differences,
        options,
        counters,
      )
    }

    return
  }

  if (expected !== actual) {
    differences.push({
      path: at,
      expected: describe(expected),
      actual: describe(actual),
    })
  }
}

const readModel = async (engine, workspaceRoot) => {
  try {
    return { ok: true, model: await engine(workspaceRoot) }
  } catch (error) {
    return { ok: false, message: error.message }
  }
}

const javascriptModel = async workspaceRoot => {
  const site = await loadSiteConfig({
    configPath: path.join(workspaceRoot, "saos.config.mjs"),
    basePath: "",
  })

  return JSON.parse(
    JSON.stringify(
      await loadSiteData({
        contentDir: path.join(workspaceRoot, "content", "blog"),
        site,
      }),
    ),
  )
}

const eliscriptModel = async workspaceRoot => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "saos-parity-"))
  const target = path.join(directory, "model.json")

  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repositoryRoot, "dist", "engine", "builder", "main.mjs"),
        "--workspace",
        workspaceRoot,
        "--model-out",
        target,
      ],
      { encoding: "utf8", cwd: repositoryRoot },
    )

    if (result.status !== 0) {
      throw new Error(
        (result.stderr.trim() || result.stdout.trim()).split("\n").pop(),
      )
    }

    return JSON.parse(await fs.readFile(target, "utf8"))
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

// ------------------------------------------------------------ diagnostics

const writePost = async (workspaceRoot, relative, text) => {
  const target = path.join(workspaceRoot, "content", "blog", relative)

  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, text)
}

const draftPost = (extra = "") =>
  `---\ntitle: Draft\ndate: 2026-01-01\ndraft: true\n${extra}---\n\nHidden.\n`

const diagnosticCases = [
  {
    name: "missing date",
    apply: root =>
      writePost(root, "broken/index.md", "---\ntitle: Broken\n---\n\nBody.\n"),
    outcome: model =>
      model.ok
        ? `no error, ${model.model.posts.length} post(s)`
        : model.message,
  },
  {
    name: "invalid date",
    apply: root =>
      writePost(
        root,
        "broken/index.md",
        "---\ntitle: Broken\ndate: not-a-date\n---\n\nBody.\n",
      ),
    outcome: model =>
      model.ok
        ? `no error, ${model.model.posts.length} post(s)`
        : model.message,
  },
  {
    name: "duplicate slug",
    apply: async root => {
      await writePost(
        root,
        "first/index.md",
        "---\ntitle: First\ndate: 2026-01-01\nslug: shared\n---\n\nOne.\n",
      )
      await writePost(
        root,
        "second/index.md",
        "---\ntitle: Second\ndate: 2026-01-02\nslug: shared\n---\n\nTwo.\n",
      )
    },
    outcome: model =>
      model.ok
        ? `no error, ${model.model.posts.length} post(s)`
        : model.message,
  },
  {
    name: "draft omitted",
    apply: root => writePost(root, "hidden/index.md", draftPost()),
    outcome: model =>
      model.ok ? `${model.model.posts.length} post(s)` : model.message,
  },
  {
    name: "slug override and neighbours",
    apply: root =>
      writePost(
        root,
        "later/index.md",
        "---\ntitle: Later\ndate: 2026-12-24\nslug: /custom/\n---\n\nLater.\n",
      ),
    outcome: model =>
      model.ok
        ? model.model.posts
            .map(post => `${post.slug}<${post.previousSlug}<${post.nextSlug}`)
            .join(" ")
        : model.message,
  },
]

const runDiagnostics = async ({ quiet }) => {
  const results = []

  for (const diagnostic of diagnosticCases) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "saos-case-"))

    try {
      await fs.cp(path.join(repositoryRoot, "examples", "basic"), root, {
        recursive: true,
      })
      await diagnostic.apply(root)

      const javascript = diagnostic.outcome(
        await readModel(javascriptModel, root),
      )
      const eliscript = diagnostic.outcome(
        await readModel(eliscriptModel, root),
      )

      results.push({
        name: diagnostic.name,
        agree: javascript === eliscript,
        javascript,
        eliscript,
      })
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }

  if (!quiet) {
    console.log("SAOS diagnostic parity")

    for (const result of results) {
      console.log(`  ${result.agree ? "ok  " : "FAIL"}  ${result.name}`)

      if (!result.agree) {
        console.log(`        javascript: ${result.javascript}`)
        console.log(`        eliscript:  ${result.eliscript}`)
      } else if (!quiet) {
        console.log(`        both: ${result.javascript}`)
      }
    }

    console.log("")
  }

  return results
}

const readMarkers = async workspaceRoot => {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(workspaceRoot, "expected-markers.json"),
        "utf8",
      ),
    )
  } catch {
    return null
  }
}

const checkMarkers = (markers, expected, actual) => {
  if (markers === null) {
    return null
  }

  const render = model => model.posts.map(post => post.html).join("\n")
  const javascript = render(expected)
  const eliscript = render(actual)

  return markers.map(marker => ({
    marker,
    missing: [
      ...(javascript.includes(marker) ? [] : ["javascript"]),
      ...(eliscript.includes(marker) ? [] : ["eliscript"]),
    ],
  }))
}

const checkWorkspace = async (options, workspace) => {
  const workspaceRoot = path.resolve(repositoryRoot, workspace)
  const differences = []
  const expected = await javascriptModel(workspaceRoot)
  const actual = await eliscriptModel(workspaceRoot)

  compareInto(expected, actual, "$", differences, options, {})

  const markers = await readMarkers(workspaceRoot)
  const coverage = checkMarkers(markers, expected, actual)

  if (!options.quiet) {
    console.log("")
    console.log("SAOS model parity")
    console.log(`  workspace:   ${workspace}`)
    console.log(
      `  posts:       ${expected.posts.length} (javascript) / ${actual.posts.length} (eliscript)`,
    )
    console.log(`  differences: ${differences.length}`)

    for (const difference of differences.slice(0, options.maxDifferences)) {
      console.log(`    ${difference.path}`)
      console.log(`      expected: ${difference.expected}`)
      console.log(`      actual:   ${difference.actual}`)
    }

    if (differences.length > options.maxDifferences) {
      console.log(
        `    ... ${differences.length - options.maxDifferences} more difference(s)`,
      )
    }

    if (coverage !== null) {
      const present = coverage.filter(entry => entry.missing.length === 0)

      console.log(`  markers:     ${present.length}/${coverage.length}`)

      for (const entry of coverage.filter(item => item.missing.length > 0)) {
        console.log(
          `    ${entry.marker} missing in ${entry.missing.join(", ")}`,
        )
      }
    }
  }

  return { differences, coverage: coverage ?? [] }
}

const main = async () => {
  const options = parseArguments(process.argv.slice(2))

  // A stale build would compare the previous source, so build first.
  const build = spawnSync(
    path.join(repositoryRoot, "node_modules", ".bin", "eliscript-build"),
    ["--config", "eliscript.json"],
    { encoding: "utf8", cwd: repositoryRoot },
  )

  if (build.status !== 0) {
    console.error(build.stdout.trim())
    console.error(build.stderr.trim())
    throw new Error(`eliscript-build exited with ${build.status}`)
  }

  let failed = 0

  for (const workspace of options.workspaces) {
    const result = await checkWorkspace(options, workspace)

    failed += result.differences.length
    failed += result.coverage.filter(entry => entry.missing.length > 0).length
  }

  const diagnostics = await runDiagnostics(options)

  failed += diagnostics.filter(result => !result.agree).length

  if (failed > 0) {
    process.exitCode = 1
  }
}

await main()
