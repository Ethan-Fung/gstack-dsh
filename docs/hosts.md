# Running gstack on other agents

The README has the host matrix: one row per agent with its tier, install
command and first invocation. This page has the rest: OpenClaw, how a checkout
decides which agents it renders for, the per-host notes, DeepSeek Harness,
outside-review providers, the Codex behavioral profile, model tiers, and the
design binary's models.

## OpenClaw

OpenClaw spawns Claude Code sessions via ACP, so every gstack skill just works
when Claude Code has gstack installed. Paste this to your OpenClaw agent:

> Install gstack: run `git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup` to install gstack for Claude Code. Then add a "Coding Tasks" section to AGENTS.md that says: when spawning Claude Code sessions for coding work, tell the session to use gstack skills. Include these examples — security audit: "Load gstack. Run /cso", code review: "Load gstack. Run /review", QA test a URL: "Load gstack. Run /qa https://...", build a feature end-to-end: "Load gstack. Run /autoplan, implement the plan, then run /ship", plan before building: "Load gstack. Run /office-hours then /autoplan. Save the plan, don't implement."

**After setup, just talk to your OpenClaw agent naturally:**

| You say | What happens |
|---------|-------------|
| "Fix the typo in README" | Simple — Claude Code session, no gstack needed |
| "Run a security audit on this repo" | Spawns Claude Code with `Run /cso` |
| "Build me a notifications feature" | Spawns Claude Code with /autoplan → implement → /ship |
| "Help me plan the v2 API redesign" | Spawns Claude Code with /office-hours → /autoplan, saves plan |

See [docs/OPENCLAW.md](OPENCLAW.md) for advanced dispatch routing and
the gstack-lite/gstack-full prompt templates.

## Native OpenClaw Skills (via ClawHub)

Four methodology skills that work directly in your OpenClaw agent, no Claude Code
session needed. Install from ClawHub:

```
clawhub install gstack-openclaw-office-hours gstack-openclaw-ceo-review gstack-openclaw-investigate gstack-openclaw-retro
```

| Skill | What it does |
|-------|-------------|
| `gstack-openclaw-office-hours` | Product interrogation with 6 forcing questions |
| `gstack-openclaw-ceo-review` | Strategic challenge with 4 scope modes |
| `gstack-openclaw-investigate` | Root cause debugging methodology |
| `gstack-openclaw-retro` | Weekly engineering retrospective |

These are conversational skills. Your OpenClaw agent runs them directly via chat.

## Which agents a checkout renders for

An explicit `--host X` installs for X only and never changes another agent's
install. `/gstack-upgrade` refreshes every install it registered, one row per
host, and says which ones failed.

A checkout carries skills only for the agents installed from it. Setup records
them in `.gstack-installed-hosts` and never drops one, so adding an agent later
is just `./setup --host <name>`. Copies rendered for other agents are pruned:
generated files move to `~/.gstack/backups/host-renders/`, and files gstack
can't prove it generated stay where they are. A global Claude install went
from 632 `SKILL.md` files (34.7 MB) to its own 63 (2.5 MB), which keeps Cursor-agent
from freezing on the skills tree (#1694). In a development checkout,
`bun run build` still renders every agent; inside an install it renders the
recorded ones, and `GSTACK_RENDER_HOSTS=all bun run build` renders them all.

## Per-host notes

Copilot invokes gstack skills by their prefixed names (`/gstack-review`) because
`/review` is a Copilot built-in. Copilot ignores skill hooks, so `/careful` and
`/freeze` only advise there, and `COPILOT_HOME` other than `~/.copilot` is not
supported yet (setup refuses and changes nothing).

Antigravity CLI also invokes skills by prefixed name (`/gstack-review`). Setup
writes only `~/.gemini/antigravity-cli/skills/gstack*`: Gemini CLI's
`~/.gemini/skills` and settings are never touched, and `--host auto` selects
Antigravity only when `agy` is on `PATH` or `~/.gemini/antigravity-cli` exists,
never for a Gemini-CLI-only `~/.gemini`. The Antigravity 2.0 app and IDE read
`~/.gemini/config/skills`, which this host does not install.

Outside reviews require the selected CLI to be installed and authenticated: Claude Code when using gstack in Codex, Codex on the other harnesses, or `dsh` in headless mode when using gstack in DeepSeek Harness (see [DeepSeek Harness](#deepseek-harness-dsh)). External harnesses discover these commands as `/gstack-claude-code` and `/gstack-codex`; each harness omits its own wrapper. Explicit provider requests keep that provider. The existing `codex_reviews` setting controls automatic outside reviews where supported, regardless of the provider selected.

`/claude` has been renamed to `/claude-code`. Re-run `./setup --host <name>` to migrate managed installations, including other harnesses sharing the checkout. Setup preserves the previous installation if replacement generation or installation fails and prints repair instructions.

## DeepSeek Harness (dsh)

DeepSeek Harness (DSH) reads user-level skills from `~/.dsh/skills/<name>/SKILL.md`
and project-level skills from `.dsh/skills/` in a checkout. gstack renders one
tree for both: `./setup --host dsh` builds a runtime root at
`~/.dsh/skills/gstack/` (the `gstack` router `SKILL.md` plus `bin/`, `lib/` and
the compiled binaries) and one `~/.dsh/skills/gstack-<skill>/` per skill, 62 of
them, while the checkout's `.dsh/skills/` (gitignored) is a DSH project skill
root. The `gstack-` prefix is required rather than stylistic: DSH indexes a
profile's skills by frontmatter `name`, so a bare `review` would not be
distinguishable from any other `review`. The router is `/gstack`; each skill is
`/gstack-<skill>`, for example `/gstack-review`. The tier is `experimental`: the
render and install arm have conformance tests, but no representative DSH
workflow has been run against them yet.

`--host auto` selects DSH when `dsh` is on `PATH` or `~/.dsh` exists — a machine
that has never run DSH has no `.dsh` directory, so detection cannot pick it up by
accident. `DSH_HOME` is read but not yet configurable: setup supports the default
`~/.dsh` and refuses a non-default value before writing anything, because the
render embeds literal `~/.dsh` paths. `./setup --status` lists the install, and
`bin/gstack-uninstall` removes only `gstack*` entries under `~/.dsh/skills/`, behind
the same provenance gate as the other hosts, because that home also holds DSH's
own memories, sessions and config.

Two capabilities differ from Claude Code. DSH has no user-level hook
configuration, so `safetyHooks` is `advisory`: `/careful`, `/freeze` and `/guard`
render as prose and cannot block. Review army is off. The second opinion is
`dsh` itself in headless mode: gstack runs `dsh --profile headless` with
`DSH_PERMISSION_MODE=read-only`, sends the prompt on stdin and reads the answer
from stdout, after resolving the binary through `GSTACK_DSH_BIN`, then `dsh` on
`PATH`, then the default install path. Headless mode does not read the desktop
sign-in, so it needs `DEEPSEEK_API_KEY` in the environment (or a `.env` in the
working directory); without it the call fails and the skill reports
`execution_failed`, `empty_response` or `timeout` instead of a review. Browser
skills still run gstack's fallback engine through `$B`; DSH's own browser tools
are not wired up yet.

`/gstack-upgrade` refreshes the DSH install like any other registered host: it
resolves the checkout through the runtime root's `.source-path` and re-links the
skill directories. The optional [`dsh-plugin/`](../dsh-plugin/README.md) package
(`gstack-dsh-plugin`) is the other way in: `dsh plugin --profile <profile> add
<path>` or the DSH Web GUI's Plugins page registers an existing install (default
`~/.dsh/skills/gstack`, overridable through the plugin's `root` config), adds it
as a skill source and exposes one read-only `gstack` tool. It writes no skill
files, so it can be installed beside the setup install; its `bundled` source
(rank 250) shadows the same tree discovered as a directory source (rank 400), so
the two registrations should collapse to one entry per skill name (not yet
observed in a running app).

`./setup --host dsh` has run against a real `~/.dsh` on Windows (2026-10-28): the
runtime root, the 62 prefixed skill directories and `.source-path` land as
described, a rerun is idempotent, `--status` lists the install and a non-default
`DSH_HOME` is refused. That run used `--no-browser`, so no browser binary was
built and `/browse`, `/qa`, `/design-review`, `/make-pdf` and `/diagram` stay
unavailable until setup runs again without the flag. Still unverified: a running
DSH loading the plugin (it is installed into one desktop profile for
evaluation, and plugin bundles load at startup), `DSH_HOME` relocation, and any
end-to-end gstack workflow on DSH — which is why the tier stays `experimental`.

## Instruction-only agents

**Instruction-only tier (any rules-reading agent — Zed, Amp, Jules, side projects):**
copy the 2KB digest at [`agents-digest/gstack-AGENTS.md`](../agents-digest/gstack-AGENTS.md)
into a location your agent reads (for example, append it to your project's `AGENTS.md`).
It carries gstack's ethos, reuse ladder, and voice rules — no install required. The
digest's first line shows its gstack version; re-copy it after upgrading.

## Codex: the behavioral profile and model selection

For Codex, setup reads the top-level `model` from
`${CODEX_HOME:-~/.codex}/config.toml` and generates the matching behavioral
profile, falling back to `gpt-6-astra` when no usable model is configured.
`gpt-5.6-sol` automatically receives bounded-scope instructions that
finish the requested lake without expanding into adjacent cleanup or speculative
hardening. The Sol profile is exact-match only: dated snapshots and other 5.6
variants get the generic GPT profile, and setup warns on near-misses like
`gpt-5.6-sol-2026-08-01`. Override detection with `./setup --host codex --model <id>` — the
override applies to that run only; set `model` in your Codex `config.toml` to
make it stick across upgrades. After changing your Codex model, rerun
`./setup --host codex` to regenerate the skills.

**Plan-review and implementation tiers.** Plan workflows use an independent
`frontier` reviewer: Fable 5.1 from Codex, or GPT-6 Astra from Claude Code.
Implementation handoffs recommend the `smart` tier: Opus 5.5 or GPT-6.1 Sol.
Choose a different tier, pin either provider's model, or use `host` mode to
preserve native model settings. The read-only `gstack-models` command explains
the effective choices; changing these settings does not require regenerating
skills or switch your running session. A weekly maintenance check flags changed
official recommendations and retirement notices without automatically changing
models. See [model policy: setup, overrides and freshness](model-policy.md).

**Other Codex calls keep their existing selection.** Without the explicit
`plan-review` role (including ordinary review and ship adversarial passes), gstack picks the model in this
order: a model you name for that request, then `GSTACK_CODEX_MODEL`, then
`model` in your Codex `config.toml` (for native `codex review`, `review_model`
first; a custom `CODEX_HOME` is honored), and only then gstack's default,
`gpt-6-astra`. Before spending anything, it prints the choice and where it came
from, for example `CODEX_MODEL: gpt-5.6-terra (exec; source: ~/.codex/config.toml model)`.
If your choice is invalid or your account cannot use it, gstack stops with a
repair message and reports the outside review as unavailable. It never silently
switches to its default. Nested Codex reviews also run with installed skills
hidden (`-c skills.include_instructions=false`), so a review cannot turn into a
whole nested skill run. Runtime model selection is separate from the setup-time
behavioral profile above. Without the plan-review role, `/claude-code` (`gstack-claude-code`
on Codex) preserves Claude's configured model. Set `GSTACK_CLAUDE_MODEL=<model>`
or name a model in your request to override it for the invocation, including
resumed consultations. See [eval defaults and overrides](../CONTRIBUTING.md#testing--evals)
for capture, judge, and benchmark model selection.

## The design binary's models

The design binary (`$D`) uses OpenAI's `gpt-5.5` by default, with image
generation through `gpt-image-2`. Set `GSTACK_DESIGN_MODEL=<model>` to use
another gpt-5-class model for both image generation and screenshot analysis;
if OpenAI rejects it, the error names `GSTACK_DESIGN_MODEL`. Set
`GSTACK_DESIGN_IMAGE_MODEL=<gpt-image model>` to change the image tool model; a
value that is not a gpt-image model name is refused before any request. Check a
key against the defaults with `bun run design/scripts/live-model-check.ts`,
which always tests the default models and ignores both overrides; the weekly
periodic census runs the same check. Set `OPENAI_BASE_URL` to send every `$D`
call to an OpenAI-compatible gateway instead of `api.openai.com`; egress
receipts record the gateway host. On Codex, `/design-shotgun` generates mockups
with Codex's built-in `$imagegen` skill instead, so it needs no
`OPENAI_API_KEY`; `$D` still builds and serves the comparison board.

## Adding a host

**Want to add support for another agent?** See [docs/ADDING_A_HOST.md](ADDING_A_HOST.md).
Rendering a new agent is one TypeScript config file; installing it also needs a
setup arm and the conformance kit, and it starts as experimental.
