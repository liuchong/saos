# Eliscript Engine Swap Roadmap

- Status: In progress
- Branch: `eliscript`
- Started: 2026-09-18

## Objective

Rewrite SAOS's generator and Action packaging in Eliscript (npm
`eliscript@0.0.1`, pinned exactly), and implement a minimal React wrapper in
`ui/` (hiccup macros plus an Atom-to-external-store subscription bridge), so
the engine changes while the product contract does not.

## Constraints

These are not preferences. They hold for every stage.

1. **No publishing.** No tag, no GitHub Release, no `npm publish`, no
   Marketplace change, no production site deployment.
2. **Version stays `0.0.1`.** Every manifest keeps `0.0.1`. Any version or tag
   change needs separate, explicit authorization.
3. **The Action contract does not move.** Inputs `content`, `config`, `public`,
   `output`, `base`; outputs `output-path`, `post-count`; same names, same
   meaning.
4. **`eliscript` is pinned exactly** to `0.0.1`. CI must use the published
   version. If a stage needs an unreleased compiler fix, stop and report it
   rather than publishing one.
5. **No compatibility layer.** No aliases, no dual read/write, no fallback. A
   temporary comparison tool is allowed only as a test instrument and is
   removed at M7.

## Where Things Live

| Thing                           | Location                                        | Why                                                                                                                                                                                                                                                                                                  |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrapper framework               | `ui/`                                           | One consumer. A separate package would add versioning and release overhead for no benefit, and SAOS is "the source is the product". Extraction becomes reasonable when a second consumer exists. It sits under `engine/` because a project has one source root, and `.eli` imports may not escape it |
| Not in the Eliscript repository | —                                               | Eliscript's own contract keeps framework integration as application evidence, not core maturity. Keeping the wrapper here also keeps the two release cadences apart                                                                                                                                  |
| This roadmap                    | `docs/roadmap-eliscript.md`                     | Updated at each stage exit; the progress percentages live here                                                                                                                                                                                                                                       |
| Baseline harness                | `tools/baseline.mjs`, `docs/parity-baseline.md` | Reproducible numbers, frozen before the swap begins                                                                                                                                                                                                                                                  |
| Comparison instrument           | `tools/parity.mjs` (from M1)                    | Test-only dual-pipeline differ, deleted at M7                                                                                                                                                                                                                                                        |

## Stages

| Stage                                 | Work                                                                                                                                                                                      | Exit evidence                                                                                                                                                                                               | Weight | Commits |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| **M0 Decision and baseline**          | Freeze the boundary; measure the current engine                                                                                                                                           | Reproducible numbers in `docs/parity-baseline.md`                                                                                                                                                           | 5%     | 1       |
| **M1 Content model**                  | Port discovery, front matter, slugs, drafts, duplicate detection, excerpts and page data into `.eli`, with the builder/renderer split (renderer holds no filesystem or network authority) | Model diff against the current engine is empty; the diagnostic set matches item by item                                                                                                                     | 15%    | 1       |
| **M2 Markdown and MDX parity**        | Keep `unified`, `remark-gfm`, `rehype-raw`, `rehype-prism-plus` and `@mdx-js/mdx` as interop dependencies; arrange the pipeline in `.eli`                                                 | Fixture corpus renders to a normalized-identical HTML; three representative posts compare visually                                                                                                          | 15%    | 1       |
| **M3 Site artifacts parity**          | `rss.xml`, web manifest, the 404 pair, static directories, content assets, base paths                                                                                                     | Artifact diff is empty; links resolve under a local server                                                                                                                                                  | 8%     | 1       |
| **M4 Action packaging**               | Single-file Node 24 bundle, per-source digest manifest, no runtime `npm ci`; contract unchanged                                                                                           | Contract test passes; the bundled Action and the current composite Action produce the same output for one workspace; verified in an isolated worktree with a local `uses:` reference; no deployment, no tag | 15%    | 1       |
| **M5 Minimal UI wrapper** (abortable) | `ui/hiccup.eli`, `ui/store.eli`, `ui/server.eli`                                                                                                                                          | Probe: SSR plus hydration with no mismatch; measured difference against the M0 numbers. If it does not beat them, record that and stop before M6                                                            | 20%    | ≤2      |
| **M6 UI migration**                   | App, layout, bio, seo and comments rewritten through `ui/`; CSS unchanged                                                                                                                 | Normalized DOM diff is empty; visual comparison passes; the Vite adapter still bundles the client with React Refresh in development                                                                         | 15%    | 1       |
| **M7 Acceptance freeze**              | Write SAOS's own acceptance into the repository; delete the temporary comparison tooling                                                                                                  | The full suite passes on a fixed source identity; no new tag; both manifests still read `0.0.1`; the list of things _not_ done is explicit                                                                  | 7%     | 1       |

Weights sum to 100%. The whole roadmap is eight to nine commits.

## Stage Scope Refinements

Recorded because a stage claim must be exactly as wide as its evidence.

**M5 delivers an element function, not a hiccup macro.** The roadmap, and the
brief behind it, asked for a hiccup macro layer. That is not possible in the
current language: `defmacro` registers a macro in the compilation unit that
declares it and a macro name cannot be imported, so an imported macro is simply
unbound. Verified directly: a module that exports `shout` and a module that
imports it fails with `unbound symbol: shout`. The options were a function
layer, or a copy of the macro in every file that uses it. The function layer is
what `engine/ui/element.eli` provides, and the language-side fix — a
module-scoped macro library — is a candidate feature for the language project,
not something this roadmap can implement.

**M3 cannot produce pages, so the page-level criteria move to M6.** The
JavaScript engine composes pages from the React server renderer, the client
tags in the Vite manifest, and the HTML template. A page therefore cannot
exist until the UI is ported, which is M6. M3 owns what does not depend on the
UI: the client build, the feed, the web manifest, the copied static and content
files, and the output layout. The 404 alias and the "links resolve under a
local server" check move to M6 with the pages, and neither is dropped. The
artifact check counts the files the JavaScript engine produces and this stage
does not, and prints them, so the gap is visible on every run instead of being
described in prose.

**M2 folds its visual comparison into M3.** M2 renders post fragments, not
pages: there is no document to look at until M3 composes the template, the
client tags, and the page data. The visual check therefore belongs to M3,
where a page exists to compare.

**M1 excludes the rendered `html` key.** That key is produced by the
Markdown and MDX pipeline, so it belongs to M2. M1 therefore proves the
metadata model, and M2 closes `html` and turns the exclusion off. The parity
tool counts and prints every deferred path on every run, so the exclusion
cannot widen unnoticed. On `examples/basic` it reports six deferred paths: the
same two posts appear in `posts`, `postsDescending`, and `postsBySlug`.

## Findings

Facts discovered while building the engine, recorded so they are not
rediscovered at cost.

| Finding                                                                                                                                                                                                                                   | Consequence                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An external project cannot import `eliscript/stdlib/*.eli`. The project builder refuses package sources with `Eliscript source import must be a relative .eli module`; only `eliscript/runtime/core/*.mjs` is reachable, as ordinary ESM. | The engine uses the compiled core runtime (`collection`, `sequence`, `order`, `text`, `regex`, and friends) plus its own modules. It cannot use `json`, `function`, `multimethod`, or the portable collection modules. M5's `ui/store.eli` must implement its own atom, because `stdlib/state/atom.eli` is unreachable. |
| Eliscript truthiness is not JavaScript truthiness. Only `false`, `null`, and `undefined` are falsy, so `""` is truthy.                                                                                                                    | Every ported step that was `x \|\| fallback` or `x ? a : b` needs an explicit host predicate, provided by `engine/support/host.eli`. This was a real defect, not a hypothetical: the site's configured base path was silently replaced by an empty `--base` until the predicate existed.                                |
| `js-nth` takes `(index, collection)`.                                                                                                                                                                                                     | Intended as `(nth index collection)`, not as a JavaScript-style `(collection, index)`.                                                                                                                                                                                                                                  |
| `t` is the true literal. `true` is unbound. `false` and `nil` (which emits JavaScript `null`) are literals.                                                                                                                               | Style rule for engine sources.                                                                                                                                                                                                                                                                                          |
| The portable `Atom` is unreachable from a package (first row), and the runtime's `compileRegex`/`regexFind` return Eliscript-shaped match values.                                                                                         | Parity-sensitive pattern work uses host `RegExp` objects through `js*`, so the two engines cannot disagree about a match shape.                                                                                                                                                                                         |

## Publish Precondition

Nothing in this roadmap publishes, so this blocks no stage. It must be
resolved before any release that ships the M4 bundle.

The Eliscript package is GPL-3.0-or-later. SAOS is 0PL. The M4 single-file
bundle inlines the Eliscript runtime into a distributed Action artifact, which
is distributing GPL-licensed code from a differently licensed project.
Resolving it is a decision for the project owner: a separate grant for the
runtime, a runtime dependency instead of an inlined bundle, or another
arrangement. No stage decides this on its own.

## Commit And Push Policy

- One commit per stage exit, plus at most one more inside M5.
- No mid-stage churn commits and no progress-only commits.
- Push when the stage commit is made.
- Never merge to `master` without explicit authorization.
- Show `git status`, the diff and the evidence before committing.

## Progress Ledger

- Stage completion = passed exit criteria ÷ total criteria.
- Total progress = Σ(stage weight × stage completion).
- Reported in three lines at each stage exit: total, current stage, and one
  sentence on any blocker. No burn-down, no effort estimates.

| Stage     | Weight | Completion |
| --------- | ------ | ---------- |
| M0        | 5%     | 100%       |
| M1        | 15%    | 0%         |
| M2        | 15%    | 0%         |
| M3        | 8%     | 0%         |
| M4        | 15%    | 0%         |
| M5        | 20%    | 0%         |
| M6        | 15%    | 0%         |
| M7        | 7%     | 0%         |
| **Total** | 100%   | **5%**     |

## Open Decision: How The Action Gets Its Client Assets

M4 assumed the packaged Action would need no package install. Measured against
the current engine, that assumption does not survive contact:

| Fact                                                  | Evidence                                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Vite 8 depends on platform-native binaries            | `@rolldown/binding-darwin-arm64` and `@esbuild/*` are in its closure                                         |
| A single file therefore cannot contain Vite           | `bun build --external vite` produces a 3.09 MB entry; without the exclusion it cannot be produced            |
| The consumer's base path is baked into the client CSS | `url(/journal/assets/...)`; with `base: "./"` the same build emits `url(./...)` and both chunk hashes change |
| The dependency closure is large                       | 82 MB, 234 packages, including the font packages that Vite needs to resolve the stylesheet                   |

Two end states are possible, and they are different products.

**A. Install and build at runtime.** The Action installs its dependency
closure and the engine drives Vite, as it does on this branch. Client-asset
byte parity stays complete and the documented fork workflow is unchanged
(edit the CSS, and CI rebuilds it). Cost: every Action run pays the install.

**B. Ship prebuilt client assets.** The engine copies assets built at package
time and never runs Vite, so the Action installs nothing. The assets must be
built with a base-independent output, which changes the emitted CSS and
JavaScript hashes, so the parity instrument needs a narrow, counted exception
for exactly those two files. Cost: a fork that edits `src/` must run the client
build and commit the result, which changes a property the README promises
("The source is the product").

This is not a decision a stage may take on its own, because it changes a
documented product property and the strength of the parity evidence. Recorded
here with the measurements so it can be decided with them.

## Abort Conditions

- M5 does not beat the baseline on its measured metrics: record the numbers and
  stop before M6. No unmeasured framework is kept.
- A stage needs a publish to continue: stop and ask.

### M5 Gate

The gate existed so that a framework could not be kept on the strength of an
argument. What it measured:

| Quantity           | Result                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| SSR and hydration  | The server rendered document hydrates with no console error or warning, so the server snapshot and the client's first value agree  |
| Update granularity | A subscribed update re-renders 1 component; the equivalent root-state update re-renders 41                                         |
| Wrapper cost       | 462 B gzip for the element layer and 556 B gzip for the store, against a 46,912 B gzip baseline client                             |
| Page metrics       | Not comparable at this stage. The M0 baseline's `fcp`, `settle`, and blocking numbers describe a page, and no page exists until M6 |

The granularity claim is measured against the equivalent naive tree, not
against the M0 baseline, because M0 has no update metric: its pages carry no
client state, which is recorded in `docs/parity-baseline.md`. The wrapper does
not subtract from the M0 numbers and does not claim to; the honest statement is
that it adds about a kilobyte and removes re-render work that a naive tree
does. The gate is passed, so M6 proceeds.

## M4 Criteria

| Criterion                                                               | State                                                                                                  |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A single-file Node 24 bundle exists                                     | met                                                                                                    |
| The bundle declares what it could not inline                            | met: `vite`, and running it in an empty directory fails only on that import                            |
| The bundled entry and the compiled entry produce the same output tree   | met                                                                                                    |
| The runtime contract is tested: outputs, defaults, and the failure path | met                                                                                                    |
| `action.yml` runs the packaged entry                                    | outstanding, and it cannot land before M6: an engine that renders no pages would regress the Action    |
| A real runner executes the Action through a local `uses:` reference     | outstanding: no runner is available in this environment, and the local emulation is not the same claim |

## Out Of Scope

- Writing a bundler or a development server. Vite stays a dependency.
- Rewriting MDX, remark or rehype. They stay dependencies.
- Changing the Eliscript language core.
- Version bumps, releases, Marketplace updates and production deployments.
