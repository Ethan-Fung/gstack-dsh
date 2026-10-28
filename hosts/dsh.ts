import { defineHost, GBRAIN_RESOLVERS, preambleToolGlossary } from './define-host';

// DeepSeek Harness (DSH): a cordis-profile agent runtime whose skill discovery
// scans depth-1 roots. The external-host layout this repo already renders
// (`<hostSubdir>/skills/gstack-<skill>/SKILL.md`) is exactly that shape, so
// `hostSubdir: '.dsh'` makes the render tree double as DSH's project-level
// skill root (rank 100) while setup installs the same tree under
// `~/.dsh/skills` (rank 400). Docs: docs/ADDING_A_HOST.md "DeepSeek Harness".
// DSH reads only name + description from frontmatter (unknown keys are ignored,
// invalid name/boolean drops the whole skill), so the allowlist strips the rest.
const DSH_TOOL_GLOSSARY =
  '**DeepSeek Harness tool names:** `AskUserQuestion` means your `ask_user_question` tool ' +
  '(one call may carry several questions and multi-select options). `ExitPlanMode` means `exit_plan_mode`. ' +
  'The Agent tool means `subagent` (`spawn_teammate` for a durable named teammate, `workflow` for large fan-out); ' +
  'the Skill tool means `skill`; `TodoWrite` means `todo_write`; the Read tool means `ops_read_files`; ' +
  'the Write tool means `write`; the Edit tool means `edit`; Grep means `ops_grep`; Glob means `ops_glob`; ' +
  'the Bash tool means `ops_bash`; WebSearch/WebFetch mean `web_search`/`web_fetch`; ' +
  '`BashOutput`/`KillShell` mean `job_output`/`job_kill`. DSH has no user-level hook configuration, so ' +
  'safety skills (`/careful`, `/freeze`, `/guard`) are advisory prose here, not enforced locks.';

const dsh = defineHost({
  name: 'dsh',
  displayName: 'DeepSeek Harness',
  cliCommand: 'dsh',
  tier: 'experimental',
  capabilities: {
    toolExecution: true,
    questions: 'native',
    planMode: true,
    delegation: true,
    browser: true,
    safetyHooks: 'advisory',
  },

  globalRoot: '.dsh/skills/gstack',
  localSkillRoot: '.dsh/skills/gstack',
  // Render output only. `.dsh/skills` is DSH's project-level skill root, so the
  // render tree is directly discoverable when DSH opens this checkout.
  hostSubdir: '.dsh',

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    // DSH rejects a description over its parser limit, and its always-loaded
    // catalog truncates each entry to catalogDescriptionMaxLength (default 500).
    // The trim below keeps the catalog entry to one line + "(gstack)" instead of
    // paying for routing prose in every session; the limit guards the raw text.
    descriptionLimit: 1024,
    descriptionLimitBehavior: 'error',
    catalogTrim: true,
    // Directory names are gstack-<skill>; DSH merges same-name skills across
    // roots, so the frontmatter name must match the directory it ships in.
    nameMatchesDirectory: true,
  },

  // Literal ~/.dsh paths (the Copilot/Antigravity model, not $GSTACK_ROOT) so
  // skills without the preamble — careful, freeze, gstack-upgrade — still
  // resolve their install location. `.source-path` (written by setup) lets
  // /gstack-upgrade find the checkout behind the runtime root.
  pathRewrites: [
    { from: 'if [ -d "$HOME/.claude/skills/gstack/.git" ]', to: 'if [ -d "$(cat "$HOME/.dsh/skills/gstack/.source-path" 2>/dev/null)/.git" ]' },
    { from: 'INSTALL_DIR="$HOME/.claude/skills/gstack"', to: 'INSTALL_DIR="$(cat "$HOME/.dsh/skills/gstack/.source-path")"' },
    { from: '$HOME/.claude/skills/gstack', to: '$HOME/.dsh/skills/gstack' },
    { from: '~/.claude/skills/gstack', to: '~/.dsh/skills/gstack' },
    { from: '.claude/skills/gstack', to: '.dsh/skills/gstack' },
    { from: '.claude/skills/review', to: '.dsh/skills/gstack/review' },
    { from: '.claude/skills', to: '.dsh/skills' },
  ],
  toolRewrites: preambleToolGlossary(DSH_TOOL_GLOSSARY),

  // The review army needs several distinct model CLIs; DSH only has its own
  // headless provider (outside-voice) so army stays off. The single-provider
  // second-opinion resolvers stay on: outside-voice dispatches them to
  // `dsh headless` on this host instead of the Codex/Claude CLIs.
  suppressedResolvers: ['REVIEW_ARMY', ...GBRAIN_RESOLVERS],
});

export default dsh;
