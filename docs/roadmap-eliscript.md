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

| Thing                           | Location                                        | Why                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrapper framework               | `ui/`                                           | One consumer. A separate package would add versioning and release overhead for no benefit, and SAOS is "the source is the product". Extraction becomes reasonable when a second consumer exists |
| Not in the Eliscript repository | —                                               | Eliscript's own contract keeps framework integration as application evidence, not core maturity. Keeping the wrapper here also keeps the two release cadences apart                             |
| This roadmap                    | `docs/roadmap-eliscript.md`                     | Updated at each stage exit; the progress percentages live here                                                                                                                                  |
| Baseline harness                | `tools/baseline.mjs`, `docs/parity-baseline.md` | Reproducible numbers, frozen before the swap begins                                                                                                                                             |
| Comparison instrument           | `tools/parity.mjs` (from M1)                    | Test-only dual-pipeline differ, deleted at M7                                                                                                                                                   |

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

## Abort Conditions

- M5 does not beat the baseline on its measured metrics: record the numbers and
  stop before M6. No unmeasured framework is kept.
- A stage needs a publish to continue: stop and ask.

## Out Of Scope

- Writing a bundler or a development server. Vite stays a dependency.
- Rewriting MDX, remark or rehype. They stay dependencies.
- Changing the Eliscript language core.
- Version bumps, releases, Marketplace updates and production deployments.
