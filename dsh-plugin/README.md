# gstack-dsh-plugin — gstack skills for DeepSeek Harness

A self-contained DSH plugin (bundle) that discovers a local gstack installation
and registers its `SKILL.md` skills with the DSH skill registry, plus one
read-only `gstack` tool that reports the installation root and what is loaded.

No runtime dependencies. Plain ESM JavaScript, Cordis-style plugin entry,
`package.json` `dsh.bundle.patch` pointing at [`cordis.patch.yml`](cordis.patch.yml).

The repository never installs the package into a DSH home by itself — installing
it is a separate, explicit user action (see [Install](#install-a-separate-explicit-action)).

## What it does

At plugin load (`apply(ctx, config)`):

1. Resolves the gstack installation root:
   `config.root` → `GSTACK_ROOT` → `$DSH_HOME/skills/gstack` →
   `$DSH_HOME/skills` → `~/.dsh/skills/gstack` → `~/.dsh/skills`.
   An explicitly configured root is authoritative and is used even when it holds
   no skills (the tool then explains what is missing). When several candidates
   hold skills, the one whose discovery yields the most skills wins: `setup`
   leaves a runtime root at `$DSH_HOME/skills/gstack` holding only a few payload
   skills, and on DSH's default home that root would otherwise shadow the flat
   `gstack-*` install sitting beside it in `~/.dsh/skills`.
2. If `enabled` and `auto` are on and a root holds skills, discovers every direct
   child directory with a `SKILL.md` (the checkout layout: `ship/`, `review/`, …
   plus the root router `SKILL.md` itself). The `gstack-*` prefixed flat install
   layout is also accepted: prefixed directories register under their prefixed
   name so they cannot collide with user skills.
3. Nested `**/SKILL.md` files are deliberately **not** discovered — same rule as
   `@deepseek-ai/dsh-skill-filesystem`; gstack's `.agents/skills/gstack-*/` and
   `node_modules` trees are therefore ignored.
4. Registers each skill with `source: 'bundled'` and
   `resourceBase: { kind: 'directory', path: <skill dir> }`, so relative resource
   references inside a skill resolve from the installed skill directory.
5. Registers the `gstack` tool (name overridable) that lists the resolved root,
   the discovered skills, their registration state, and — when nothing is found —
   every candidate path tried and how to fix it.
6. Returns one disposer that unregisters every contribution when the plugin is
   unloaded.

Missing installation root is **not** an error: the plugin logs one clear warning,
registers only the tool, and keeps loading.

## Files

| File | Role |
|---|---|
| `index.js` | Public entry; option parsing, logger, skill registration, `gstack` tool definition, `apply(ctx, config)` |
| `lib/discovery.js` | Root candidate chain, probe, skill discovery and filtering |
| `lib/frontmatter.js` | YAML-subset front-matter parser (quoted values, lists, block scalars) |
| `index.d.ts` | Public types for tests, editors and bundle consumers |
| `cordis.patch.yml` | Bundle patch row inserted into the profile's plugin tree |
| `package.json` | ESM entry, `dsh.bundle.patch`, zero dependencies |

Tests (in the parent repository): `test/dsh-plugin.test.ts` — run
`bun test test/dsh-plugin.test.ts`.

## Configuration

Patch-row config (all optional):

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` registers nothing except a log line |
| `auto` | boolean | `true` | `false` registers the tool only, no skills; re-enable to load the catalog |
| `includeRouter` | boolean | `true` | Whether the root `gstack` router skill participates |
| `root` | string | — | Explicit installation root; authoritative, overrides the env/home chain |
| `exclude` | string[] | `[]` | Skill names (the registered name, prefixed form included) to skip |
| `toolName` | string | `gstack` | Name of the report tool |

Discovery is re-run on every tool call, and skill registration retries on config
change / HMR reload, so installing gstack after the plugin starts needs no
plugin restart (the tool reports `registered: 0` until then).

## Discovery rules

- A directory counts as one skill when it directly contains `SKILL.md`. The root
  `SKILL.md` itself is the router, not a child skill.
- Front matter must contain kebab-case `name` and `description`; invalid files are
  skipped with a warning. `whenToUse`, `version` and the invocation flags are
  preserved; YAML block scalars and quoted values are unfolded.
- The root `SKILL.md` (the `gstack` router) is included only when its front matter
  `name` is `gstack` (or the root directory itself is named `gstack`).
- In a mixed root, entries whose description carries `(gstack)` (gstack's
  generated marker) are accepted even without the `gstack-` prefix; unrelated
  user skills stay out.
- First registration wins on duplicate names; later duplicates are reported as
  warnings.

## Install (a separate, explicit action)

Installing changes DSH behavior and requires the user's explicit permission.
This repository already ships the bundle; the operator installs it in their own
profile, at their own request, with e.g.:

```bash
dsh plugin --profile desktop add <path-to>/dsh-plugin
```

Then confirm the profile lists the package (a dependency plus an entry in
`dsh.profile.bundles`) and restart DSH, or let HMR reload. The bundle's own
`package.json` names `cordis.patch.yml` as its patch, so the plugin's row comes
from the package. Nothing in this checkout writes `~/.dsh`; on the machine the
package was developed on, one desktop profile was linked to this checkout for
evaluation, with the user's explicit permission.

## Relationship to the filesystem skill source

DSH can also discover the same `SKILL.md` files from disk
(`@deepseek-ai/dsh-skill-filesystem`: project 100, project-agents 200, custom 300,
user-dsh 400, user-agents 500, bundled 600 — lower rank wins). Skills registered
through `ctx.skills.register()` are **runtime** entries (`RUNTIME_RANK = 250`) in
the same layer, so the plugin's registration wins a same-name duplicate against a
user-directory install (400) — the opposite of a provider ranked 600. Because the
default discovery chain points at the same installation root a user installs to,
the winning content is normally identical; but if the plugin is pointed at an
older checkout while a newer copy is installed under `~/.dsh/skills/gstack`, the
plugin's copy wins. Keep one source of truth per skill name: point `root` at the
install the user should see, or set `auto: false` and rely on directory discovery
alone.

## Uninstall

- **Disable without removing:** set `enabled: false` in the patch row (or toggle
  the row off in the Plugins page). Unloading runs the returned disposer, which
  unregisters every skill and the tool.
- **Remove the bundle:** `dsh plugin --profile <profile> remove gstack-dsh-plugin`
  deselects and unloads it, then removes the package. The gstack installation root
  is untouched.
- The plugin never writes user configuration, `~/.dsh`, or the installation root;
  everything is read at discovery time and re-read on tool calls.

## Known limitations / risks

- **Installed once, not runtime-verified.** One desktop profile links this
  checkout for evaluation, but no running DSH has loaded the plugin yet (a
  restart loads it). It was written against the published contract surface
  (`skills.register`, `tools.register`, `ctx.effect`, `dsh.bundle.patch`) and
  the local no-dependency plugin sample.
- **The CLI install path is untested here.** `dsh` is not on `PATH` on the
  authoring machine, so `dsh plugin add` has not been exercised; the install was
  done by adding the profile dependency and `dsh.profile.bundles` entry, and the
  CLI form above is the documented one.
- **SSOT is a local install.** The plugin registers files from the gstack
  installation root; it does not bundle copies. Moving or deleting that root
  leaves stale skill content until the next discovery.
- **Catalog size.** Every gstack skill becomes a catalog entry; use `exclude`,
  `includeRouter`, or `auto` to trim it. The session catalog caps each
  description, not the entry count.
- **Upgrade coupling.** gstack's own `setup`/`gstack-upgrade` manages the
  installation root and may rename or delete directories between releases; the
  next discovery follows the filesystem rather than a pinned manifest.
- Removing the profile dependency removes the bundle's contributions, but the
  gstack installation itself stays where it is.
