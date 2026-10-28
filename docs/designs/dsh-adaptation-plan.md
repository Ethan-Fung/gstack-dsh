# gstack → DeepSeek Harness (DSH) 适配方案

| 项 | 值 |
|---|---|
| 状态 | **已实施（2026-10-28）**；`~/.dsh` 安装与 DSH 插件安装已获用户批准并执行，插件待 DSH 重启后加载（阶段状态见文首「实施状态」） |
| 日期 | 2026-10-28 |
| 工作区 | `C:\DevProjects\gstack-dsh`（gstack fork，上游 `garrytan/gstack`） |
| 目标运行时 | DeepSeek Harness `0.2.1-rc.3`，`DSH_HOME=C:\Users\Ethan_Fung\.dsh` |
| 目标 | 让 gstack 的 62 个技能 + 工作流能在 DSH 中原生运行，并纳入 gstack 现有的 host 渲染/安装/升级体系 |

---

## 实施状态（2026-10-28 更新）

| 项 | 值 |
|---|---|
| 状态 | P0–P3 已落地，P4 完成 2/5（分支 `feat/dsh-host`，工作区 `C:\DevProjects\gstack-dsh`） |
| 已安装到本机 | **是（2026-10-28，用户批准后执行）**：`bash ./setup --host dsh --no-browser` 已写入 `~/.dsh/skills`（62 个 `gstack-*` + 路由器 `gstack`，`.source-path` 指回 checkout，`--status` 为 current，重跑幂等）；`gstack-dsh-plugin` 已加入 desktop profile（`link:` 依赖 + `dsh.profile.bundles`），待 DSH 重启加载。未在真实 DSH 会话里跑过 gstack 工作流；浏览器引擎因 `--no-browser` 未构建 |
| 落地形态 | `hosts/dsh.ts` + `hosts/index.ts` 注册；`setup` 的 DSH 安装臂；`bin/gstack-host-renders.sh`、`bin/gstack-install-registry.sh`、`bin/gstack-uninstall`；`scripts/resolvers/outside-voice.ts` 的 `dsh` provider；独立包 `dsh-plugin/`；文档（`docs/hosts.md`、`docs/ADDING_A_HOST.md`、`docs/troubleshooting.md`、`docs/PROJECT_STRUCTURE.md`、`README.md`、本文件） |
| 已验证 | `bun run gen:skill-docs --host dsh` 冒烟：`.dsh/skills/` 63 个目录（router `gstack` + 62 个 `gstack-*`），frontmatter 只剩 `name`/`description`，无 `~/.claude` 残留；`host-config` / `external-host-carve` / `gen-skill-docs` / `host-conformance` 的 dsh 断言除 4 个 Windows 预存失败外全绿；`test/dsh-plugin.test.ts`、`test/outside-voice-dsh.test.ts` 通过；真实安装（Windows，2026-10-28）：63 个条目落盘、`.source-path` 回指 checkout、`--status` current、重跑幂等、非默认 `DSH_HOME` 拒绝；`bun run typecheck` 与 `typecheck:test` 全绿 |
| 未验证 | 真实 DSH 端到端工作流；插件在运行中的 DSH 加载（需重启）；浏览器技能（`--no-browser` 未构建引擎）；`DSH_HOME` relocation（一期直接拒） |

**阶段状态**

| 阶段 | 状态 | 落地事实 | 未做 |
|---|---|---|---|
| Phase 0 前置 | 已完成 | Bun 1.4.4 可用（在 nvm 的 `node_modules/bun` 下，未入 PATH，需先 `export PATH`）；Git Bash 已有；DSH 0.2.1-rc.3 | — |
| Phase 1 渲染层 | 已完成 | `hosts/dsh.ts`（tier `experimental`、`hostSubdir: '.dsh'`、布局 `.dsh/skills/gstack/SKILL.md` + `.dsh/skills/gstack-<skill>/SKILL.md`、frontmatter 只留 `name`/`description`、`descriptionLimit: 1024` + `error`、`catalogTrim`、`nameMatchesDirectory`、`pathRewrites`、工具名表、`suppressedResolvers: ['REVIEW_ARMY', ...GBRAIN_RESOLVERS]`）；`.gitignore` 加 `.dsh/` | `defaultModel` 未声明（沿用 `claude`，即 §3.4 选项 A）；`commentGuidance` 未启用 |
| Phase 2 安装层 | 已完成并已在本机执行（2026-10-28） | `setup` 有完整 DSH 臂：`DSH_HOME`/`DSH_SKILLS`/`DSH_GSTACK`、自动检测 `command -v dsh` 或 `[ -d "$DSH_HOME" ]`、`--host dsh`、`create_dsh_runtime_root`、`link_dsh_skill_dirs`、registry 行、`--status`、uninstall（provenance 门）；非默认 `DSH_HOME` 显式拒绝；已真实执行 `./setup --host dsh --no-browser`，layout、`.source-path`、幂等性实测通过 | 浏览器引擎未构建（`--no-browser`）；`bun run skill:check` 未跑 |
| Phase 3 内容契约层 | 已完成 | 工具名映射进 preamble；`catalogTrim` 与 frontmatter 收窄落地（`scripts/host-config.ts`、`scripts/gen-skill-docs.ts`）；文档四项完成（hosts.md、ADDING_A_HOST.md 认证行、README 矩阵、troubleshooting/PROJECT_STRUCTURE） | 模型家族（R8 选项 B）未做；`$B` → `bsk_*` 未做（见 P4） |
| Phase 4 深度能力 | 部分完成（2/5） | `dsh` outside-voice provider（`dsh --profile headless`，read-only，`DEEPSEEK_API_KEY` / `GSTACK_DSH_BIN`）；独立插件包 `dsh-plugin/`（`gstack-dsh-plugin`，已作为 `link:` 依赖装入 desktop profile 并登记进 `dsh.profile.bundles`，待 DSH 重启加载） | hooks 强制化；浏览器 `bsk_*`；Team/Workflow 映射 |

用户拍板的四个决策已落地：`gstack-` 前缀、user 级安装（`~/.dsh/skills`）、另做独立插件包、`dsh headless` 二次意见。

---

## 0. 结论（TL;DR）

1. **不需要重写技能。** gstack 已经把「同一套技能渲染给不同 agent」抽象成 12 个 host（2026-10-28 实施后为 13 个，含 `dsh`；`hosts/*.ts` + `scripts/host-config.ts:38` 的 typed `HostConfig`）；DSH 是这 12 个之外**最接近 Claude Code** 的目标：SKILL.md + YAML frontmatter、目录束（`references/`/`scripts/`/`assets/`）、`/name` 斜杠调用、`AGENTS.md`/`CLAUDE.md` 指令链、原生问询工具、原生 plan mode、子 agent、Team 全部具备。所以适配 = **新增一个 `hosts/dsh.ts` + 一个 setup 安装臂 + 若干内容改写**。
2. **有一个结构巧合可以直接利用。** gstack 外部 host 的渲染/安装布局是 `<hostSubdir>/skills/gstack-<skill>/SKILL.md`（`scripts/gen-skill-docs.ts:735-737`、`scripts/external-skill-names.ts:1`），而 DSH 的技能发现规则是「扫描根的直接子目录 `<name>/SKILL.md`，深度 1」——**两者同构**。把 `hostSubdir` 定为 `.dsh` 后，`.dsh/skills/` 同时就是 DSH 的项目级技能根（rank 100，见 §1.2.2）。
3. **三个硬约束决定方案边界**：
   - DSH 核心**没有用户级 hooks 配置** → gstack 的 `/careful`、`/freeze`、`/guard` 只能降级为 advisory 文案（gstack 外部 host 已有此机制，`scripts/gen-skill-docs.ts:568` 的 `extractHookSafetyProse`）。
   - DSH 技能发现**只扫深度 1** → 必须平铺，不能把整仓 / 整树塞进一个 `skills/gstack/` 再指望被发现（例外：根目录的 router SKILL.md 本身就是一个技能）。
   - gstack 的 `browse/dist`、`design/dist`、`make-pdf/dist` 是 **Mach-O arm64 专有二进制**（`.gitignore:3-6`、AGENTS.md「Compiled binaries」）→ Windows 上必须用 Bun 从源码重建，否则 `/browse`、`/design-*`、`/make-pdf`、`/diagram` 不可用。
4. **建议分期**：P0 前置 → P1 渲染（1–2h）→ P2 安装（半天）→ P3 内容契约（半天）→ P4 深度能力（可选）。**MVP 约 2–4h CC+gstack**（见 §7）。
5. **需要你拍板的 4 个决策**见 §6（技能命名前缀、安装范围、是否做 DSH 插件包、hooks/浏览器/跨模型是否进一期）；2026-10-28 四个决策均已拍板并落地。

---

## 1. 两个系统的现状

### 1.1 gstack：一套技能，12 个 host（实施后 13 个）

| 事实 | 证据 |
|---|---|
| 62 个 `*/SKILL.md.tmpl` + 1 个根 `SKILL.md.tmpl`（共 63 个模板；渲染为 62 个技能 + 1 个 router `gstack` = 63 个技能目录） | `ls -d */SKILL.md.tmpl \| wc -l` = 62；`ls SKILL.md.tmpl */SKILL.md.tmpl \| wc -l` = 63 |
| host 契约：`HostConfig` 接口，字段含 `capabilities`/`frontmatter`/`pathRewrites`/`toolRewrites`/`suppressedResolvers`/`runtimeRoot`/`install` 等 | `scripts/host-config.ts:38-154` |
| 默认值：`defineHost()` 把 `tier` 默认 `experimental`、`questions:'prose'`、`safetyHooks:'advisory'`、`hostSubdir:.<name>`、`globalRoot:.<name>/skills/gstack` | `hosts/define-host.ts:120-161` |
| 已注册 12 host：claude(full) / codex、kiro、factory、opencode、cursor、copilot、agy(experimental) / slate、openclaw、hermes、gbrain(instruction-only)；2026-10-28 实施后为 13 个（含 `dsh`） | `hosts/index.ts:23`；tier 语义见 `docs/ADDING_A_HOST.md:146-150` 与「认证表」`:165-185` |
| 外部 host 渲染输出：`<outputRoot>/<hostSubdir>/skills/gstack-<name>/SKILL.md`；router 固定为 `skills/gstack/SKILL.md` | `scripts/gen-skill-docs.ts:735-737`、`scripts/external-skill-names.ts:1-6` |
| 安装布局（以 agy/copilot 为例）：`~/.gemini/antigravity-cli/skills/gstack` 为 runtime root，同父目录下 `gstack-<skill>/` 为各技能目录 | `setup:3316`（copilot）、`setup:3391`（agy） |
| runtime root 内容：根 router SKILL.md + `bin`/`lib`/`browse/dist`/`browse/bin` + `_link_runtime_dists`（design/make-pdf/freeze/careful/checklist/VERSION…）+ `_copy_runtime_skill_refs` + `ETHOS.md` + `.source-path` | `setup:745`、`setup:796`、`setup:806`、`setup:809` |
| 安装由 setup 臂完成：`_setup_arm_begin` → `_prune_stale_generated` → `link_<host>_skill_dirs` → `_activate_runtime_root`（原子换入）→ `_setup_arm_publish`（写 `$GSTACK_STATE_ROOT/installs.tsv`） | `setup:1236-1237`、`setup:2867`、`bin/gstack-install-registry.sh` |
| 新增 host 的 6 步最小流程 + 完整流程（setup 臂、测试、文档） | `docs/ADDING_A_HOST.md:6-180` |
| 模型家族与 host 分离：`ALL_MODEL_NAMES` 只有 claude/gpt/gemini/o-series 系列，**没有 deepseek** | `scripts/models.ts:18-31`、`scripts/models.ts:96-103`、`model-overlays/*.md` |
| 安全 hooks 只对 claude 生效（`hosts/claude/hooks/*`：AUQ 失败回退、提问偏好/日志、时间线） | `hosts/claude/hooks/` 目录；外部 host `safetyHooks:'advisory'` 时由 `extractHookSafetyProse` 在 /careful /freeze /guard 顶部插一行提示（`scripts/gen-skill-docs.ts:568-594`） |
| 已实测：62 个技能模板的 description 全文最长 769 字符，**14 条 > 500**；Claude 侧 catalog-trim 后 ≤208 的规则只对 `host === 'claude'` 生效 | 本机统计脚本；影响与处理见 §3.3 |

> 关键结论：**DSH 不是新范式，gstack 已经有「外部 host」这条成熟生产线**；新增 dsh 是这套机制内的第 13 个 host，不是改架构。

### 1.2 DSH：组合式 profile + 技能目录 + 插件

#### 1.2.1 形态

- DSH 是一个「profile = 有序插件层（cordis patch）栈」的宿主：`~/.dsh/profiles/<name>/{package.json, cordis.yml, cordis.patch.yml}`；`dsh --profile <name>` 启动，`--dump-config` 打印组合后的插件树（本机 web profile 有 **201 个插件条目**，见 §9）。
- 插件 = npm 包，`package.json` 里 `dsh.bundle.patch` 指向 `cordis.patch.yml`；profile 的 `dsh.profile.bundles` 列出 bundle，逐层打补丁，最后叠用户 `cordis.patch.yml`。已有零依赖插件样例：本机 `~/.dsh/agent-plugins/uml-drawing-skill-dsh-plugin/`（`index.js` + `cordis.patch.yml`，启动时 `skills.register({name, description, content, source:'bundled', resourceBase})`，tools 用 `ctx.tools.register` + 手写 JSON Schema）。
- 安装插件：`dsh plugin --profile <name> add <pkg>`（转发 pnpm 到 profile 目录）；桌面版另有 `plugin_manager` 工具与 Web「Plugins」页，装/删/启停 + HMR 立即生效。
- CLI 实测（本机）：`dsh --version` = `0.2.1-rc.3`；`dsh headless "task"` 是**一次性 agent**（stdout 输出，`--json` 输出运行事件，`--session-id` 续会话）——这就是 DSH 侧的 `claude -p` 等价物；desktop profile 由 Electron 独占管理（CLI 启动会报错，只能走桌面 App）。

#### 1.2.2 技能发现（决定安装布局的核心事实）

`dsh-skill-filesystem` 按**根 + 优先级**扫描，**只认直接子项**（`<root>/<name>/SKILL.md` 或扁平 `<root>/<name>.md`；嵌套的 `**/SKILL.md` 刻意不发现）：

| rank | 来源 | 路径 |
|---|---|---|
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | 插件配置 `customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills`（跳过 `.system`） |
| 500 | user-agents | `<agentsHome>/skills` |
| 600 | bundled | `$DSH_BUNDLED_SKILL_DIR` |

`projectRoot` = 最近的含 `.git` 的祖先目录；同名技能按 rank 合并（低 rank 胜）；符号链接目录可用。

**frontmatter 解析**（`dsh-skill-filesystem`）：必填 `name`（kebab-case）+ `description`；可选 `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`；未知键（如 gstack 的 `allowed-tools`/`version`/`preamble-tier`）**被忽略、不报错**；布尔值非法或 `name` 非法时**整条技能被丢弃**（有 warning）。

**模型侧注入方式**：不是全文注入，而是首请求前注入一条 durable user-role 的 `<available_skills>` 目录（每条仅 name + description，description 截断到 `catalogDescriptionMaxLength`（默认 **500**）），模型需要时调 `skill` 工具按名取全文（`<skill_content>` + resourceBase）；用户可直接输入 `/name` 调用（user-invocable 时）。**这就是本会话系统提示里 `<available_skills>` 段的来源。**

#### 1.2.3 与 Claude Code 的差异速查

| 能力面 | Claude Code | DSH | 对 gstack 的影响 |
|---|---|---|---|
| 技能格式 | SKILL.md + YAML + 目录束 | 同 | 直接兼容 |
| 技能调用 | `/name` + Skill 工具 | 同（`skill` 工具 + `/name`） | 直接兼容 |
| 指令文件 | CLAUDE.md | `$DSH_HOME/AGENTS.md` → `~/.agents/AGENTS.md` → 项目链；**CLAUDE.md 与 AGENTS.md 同为候选并去重**，`maxBytes` 65536 | gstack 的 CLAUDE.md/AGENTS.md 零成本生效 |
| 问询 | AskUserQuestion | `ask_user_question`（原生，支持多题/多选） | 需工具名改写 |
| 计划模式 | ExitPlanMode 工具 | `exit_plan_mode` + 原生 plan-mode 插件（强制只读 prose） | 需工具名改写；能力强于外部 host 默认 |
| 子 agent | Task/Agent 工具 | `subagent` / `subagent_fork` / `spawn_teammate`（Team）/ `workflow` / `ralph` | 需工具名改写；能力更强 |
| hooks | settings.json 用户级 hooks（可拦工具） | **核心无用户级 hooks**；有会话事件流可被 host 插件订阅；Claude 式 `hooks.json` 由第三方 `dsh-agent-plugins-market` 翻译（10 事件，deny/ask/allow/add context/forced continuation/halt） | 安全类技能降级 advisory；强制化只能二期走插件 |
| MCP | `mcp__server__tool` | 同命名；`dsh-mcp-client` 每 server 一行配置 | 兼容 |
| 权限 | permissions 配置 | `dsh-permission-presets`（sandbox + approval 联动），本机默认 `danger-full-access`，会话内可关闭 approval | 需在文档里提示风险 |
| 插件/市场 | `.claude-plugin` marketplace | cordis profile + npm bundle + `plugin_manager`/Web 插件页 + HMR | gstack 可封装为 DSH 插件（P4 可选项） |
| 一次性 agent | `claude -p` | `dsh headless "<task>"`（`--json`/`--session-id`） | 跨模型二次意见的替换点 |
| 浏览器 | Chromium daemon（`$B`） | 自带 `bsk_*` 浏览器工具（用户真实 Chromium、已登录态） | 建议优先接 `bsk_*`（P4） |

---

## 2. 目标架构（四层）

```
┌──────────────────────────────────────────────────────────────────┐
│ L3 深度能力（P4，可选）                                           │
│  hooks 桥 / bsk_* 浏览器 / dsh headless 跨模型 / dsh 插件包       │
├──────────────────────────────────────────────────────────────────┤
│ L2 安装层（P2）：setup dsh 臂                                     │
│  ~/.dsh/skills/gstack/        ← runtime root（router SKILL.md+bin/lib/dist）│
│  ~/.dsh/skills/gstack-<skill>/ ← 62 个技能目录（DSH rank 400 发现）│
│  .source-path / installs.tsv / 原子换入 / 所有权门                │
├──────────────────────────────────────────────────────────────────┤
│ L1 内容契约层（P3）：hosts/dsh.ts 的配置                          │
│  toolRewrites（工具名映射）· pathRewrites（~/.claude→~/.dsh）      │
│  frontmatter（allowlist name/description，≤500）· capabilities     │
│  suppressedResolvers（依赖缺失 CLI 的跨模型 resolver 一期关闭）    │
├──────────────────────────────────────────────────────────────────┤
│ L0 渲染层（P1）：hosts/dsh.ts + gen-skill-docs                    │
│  .dsh/skills/gstack/SKILL.md + .dsh/skills/gstack-<skill>/SKILL.md│
│  （= DSH 项目级技能根，rank 100）                                 │
└──────────────────────────────────────────────────────────────────┘
```

**为什么 L0 的 `.dsh/skills` 是正确选择**：DSH 的项目级根就是 `<projectRoot>/.dsh/skills`，gstack 的渲染树天然落在这里；既能在 gstack-dsh 仓库里「自举」调试（DSH 打开本仓库即看到渲染树），又和 setup 的安装源保持同一形态。

---

## 3. 落地步骤

### Phase 0 前置（约 0.5–1h，人工一次性）—— 已完成

| 项 | 现状 | 动作 |
|---|---|---|
| Bun | **本机未安装**（`bun: command not found`；node v24.20.0、git 2.56.0） | 安装 Bun（`powershell -c "irm bun.sh/install.ps1 | iex"` 或 scoop/choco），Windows 需 Git Bash 已具备 |
| Git Bash | 已有（git 2.56） | 无 |
| DSH | 已装桌面版（0.2.1-rc.3），`~/.dsh/skills` 现有 16 个用户技能（ef-*/humanizer-zh/i-have-adhd/uml-drawing/darwin-skill 等） | 无；确认 `dsh --version` 可跑 |
| DSH 侧验证点 | `~/.dsh/skills` 是 rank 400 用户根；`.dsh/skills` 是 rank 100 项目根 | 安装后用 §4 的清单验收 |

> 决策点 D2（安装范围）在 Phase 0 结束前拍板：**推荐先做 user 级**（`~/.dsh/skills`），项目级同机制可选。

> **2026-10-28 实施记录**：Bun 1.4.4 已可用（nvm 下的 `node_modules/bun`，未入 PATH，构建/渲染前需显式 `export PATH`），Phase 0 完成；D2 按推荐落为 A（user 级 `~/.dsh/skills`），checkout 内 `.dsh/skills/` 作为 DSH 项目级技能根同时渲染。下表「本机未安装」是撰写时的状态，已过期。

### Phase 1 渲染层（P1，约 1–2h CC+gstack）—— 已完成

> **实施差异（2026-10-28）**：`suppressedResolvers` 实际只保留 `REVIEW_ARMY` 与 `GBRAIN_RESOLVERS`——二次意见改由 `scripts/resolvers/outside-voice.ts` 新增的 `dsh` provider 承接，所以草案里列的 `CODEX_SECOND_OPINION`、`CODEX_PLAN_REVIEW`、`ADVERSARIAL_STEP`、`DESIGN_OUTSIDE_VOICES` 保持开启；`commentGuidance`、`defaultModel` 未声明（模型沿用 `claude`，即 §3.4 选项 A）；`pathRewrites` 另加两条，令 `/gstack-upgrade` 通过 runtime root 的 `.source-path` 解析到 checkout。

#### 1) 新建 `hosts/dsh.ts`（草案，直接可落地）

```ts
import { defineHost, GBRAIN_RESOLVERS, preambleToolGlossary } from './define-host';

// DSH 工具名与 Claude 工具名的对应。gstack 模板把 Claude 工具名写死在 prose 里
// （仓库内 AskUserQuestion 出现 735 个文件、ExitPlanMode 11 个），所以这份术语表
// 是渲染期 replaceAll 的唯一来源（见 hosts/define-host.ts:74 的 preambleToolGlossary）。
const DSH_TOOL_GLOSSARY =
  '**DeepSeek Harness tool names:** `AskUserQuestion` means `ask_user_question` ' +
  '(one call may carry several questions and multi-select options). `ExitPlanMode` means `exit_plan_mode`. ' +
  'The Agent tool means `subagent` (or `spawn_teammate` when a durable named teammate is wanted); ' +
  'the Skill tool means `skill`; `TodoWrite` means `todo_write`; the Read tool means `read` (or `ops_read_files` for many ranges); ' +
  'the Write tool means `write`; the Edit tool means `edit`; Grep means `ops_grep`; Glob means `ops_glob`; ' +
  'the Bash tool means `ops_bash`; WebSearch means `web_search`; WebFetch means `web_fetch`; ' +
  '`BashOutput` means `job_output` and `KillShell` means `job_kill`. DSH has no user-level hook configuration, ' +
  'so safety skills (`/careful`, `/freeze`, `/guard`) are advisory prose here, not enforced locks.';

const dsh = defineHost({
  name: 'dsh',
  displayName: 'DeepSeek Harness',
  tier: 'experimental',                 // 与 agy/copilot 同级；full 需跑完认证表
  capabilities: {
    toolExecution: true,
    questions: 'native',
    planMode: true,
    delegation: true,
    browser: true,                      // 一期沿用 $B；P4 再切 bsk_*
    safetyHooks: 'advisory',            // DSH 无用户级 hooks
  },

  // 渲染树 = <repo>/.dsh/skills/...，即 DSH 的项目级技能根（rank 100）
  hostSubdir: '.dsh',
  // 安装根：~/.dsh/skills/gstack（runtime root）；技能目录为其兄弟 gstack-<skill>/
  globalRoot: '.dsh/skills/gstack',
  localSkillRoot: '.dsh/skills/gstack',

  frontmatter: {
    mode: 'allowlist',
    keepFields: ['name', 'description'],
    // DSH catalog 把 description 截断到 500（catalogDescriptionMaxLength 默认值）。
    // 外部 host 渲染保留完整描述（catalog-trim 只对 claude 生效）：62 条里 14 条 > 500、最长 769，
    // 所以这里设 1024/error，并给 dsh 打开新增的 catalogTrim（见 §3.3）。
    descriptionLimit: 1024,
    descriptionLimitBehavior: 'error',
    catalogTrim: true,
    nameMatchesDirectory: true,         // 目录已是 gstack-<name>，name 必须等于目录名
  },

  // 用 literal 路径（copilot/agy 模式），因为 /careful /freeze /guard /gstack-upgrade
  // 这些无 preamble 的技能也要能解析出安装位置。DSH_HOME 非默认值见 §5-R7。
  pathRewrites: [
    { from: '~/.claude/skills/gstack', to: '~/.dsh/skills/gstack' },
    { from: '$HOME/.claude/skills/gstack', to: '$HOME/.dsh/skills/gstack' },
    { from: '.claude/skills/gstack', to: '.dsh/skills/gstack' },
    { from: '.claude/skills/review', to: '.dsh/skills/gstack/review' },
    { from: '.claude/skills', to: '.dsh/skills' },
  ],
  toolRewrites: preambleToolGlossary(DSH_TOOL_GLOSSARY),

  // 一期关闭依赖 claude/codex CLI 的 resolver（DSH 侧暂时没有对应二进制）；
  // P4 用 `dsh headless` 做跨模型后再逐个打开。
  suppressedResolvers: [
    'REVIEW_ARMY',
    'CODEX_SECOND_OPINION',
    'CODEX_PLAN_REVIEW',
    'ADVERSARIAL_STEP',
    'DESIGN_OUTSIDE_VOICES',
    ...GBRAIN_RESOLVERS,
  ],
});

export default dsh;
```

> `defaultModel` 暂不声明（= `claude`，见 §5-R8 与 Phase 3 的模型选项）。`tier='experimental'` 要求同 PR 里带上安装臂，否则 `test/host-conformance.test.ts` 会红（§5-R6）；如果先只做渲染，可临时 `tier:'instruction-only'` 并在下一 PR 升级。

#### 2) 注册与工程化

| 文件 | 改动 |
|---|---|
| `hosts/index.ts` | `import dsh from './dsh'`；加进 `ALL_HOST_CONFIGS`；末尾再导出 |
| `.gitignore` | 加 `.dsh/`（与 `.agents/`、`.agy/` 等并列） |
| `bin/gstack-host-renders.sh:27` | `GSTACK_HOST_RENDER_DIRS` 追加 `dsh:.dsh` |
| `test/host-config.test.ts:40` | `ALL_HOST_CONFIGS` 数量 12 → 13 |
| `test/host-renders.test.ts:45` | 若该测试按 host 对表，自动随 `hostSubdir` 通过（无需改，跑一遍确认） |

#### 3) 冒烟

```bash
bun install
bun run typecheck
bun run gen:skill-docs --host dsh
ls .dsh/skills | wc -l          # 期望 63（router gstack + 62 技能）
sed -n '1,12p' .dsh/skills/gstack-ship/SKILL.md   # name: gstack-ship，仅 name+description
bun test test/host-config.test.ts test/gen-skill-docs.test.ts \
         test/external-host-carve.test.ts test/host-renders.test.ts
```

> `test/external-host-carve.test.ts` 对**每个** `name!=='claude'` 的 host 跑四件事：ship/plan-ceo-review 的 `sections/` 相对指针、四种 model overlay 渲染无 error、`$GSTACK_ROOT` 不泄漏、160KB 上限。**它是新 host 的第一道真实门禁**，Phase 1 就会跑它，等于提前暴露大部分内容问题。

### Phase 2 安装层（P2，约 150–250 行 setup，半天 CC+gstack）—— 代码已完成，未在本机执行

> **实施状态（2026-10-28）**：安装臂代码已落地但**未在本机执行**。`DSH_HOME` 非默认值改为**显式拒绝**（安装前报错退出、不写任何文件），未做 per-install render，R7 因此收窄为「一期只支持默认 `~/.dsh`」；自动检测为 `command -v dsh` 或 `[ -d "$DSH_HOME" ]`；`--status`、`bin/gstack-install-registry.sh` 的 registry 行、`bin/gstack-uninstall` 的 provenance 门均已覆盖；`test/host-conformance.test.ts` 的 `DISCOVERY` 与 `test/runtime-root-assets.test.ts` 的 `ROOT_BUILDERS` 已登记 `dsh`（Windows 上安装臂用例 skip，见 R6）。

DSH 的技能根与 gstack 现有 agy/copilot 完全同构，**照抄 agy 臂即可**，把 `~/.gemini/antigravity-cli/skills` 换成 `~/.dsh/skills`：

| 动作 | 参照 | 说明 |
|---|---|---|
| 目录变量 | `setup:575-585`（AGY_*） | `DSH_HOME=${DSH_HOME:-$HOME/.dsh}`；`DSH_SKILLS="$DSH_HOME/skills"`；`DSH_GSTACK="$DSH_SKILLS/gstack"`；`DSH_DIR="$SOURCE_GSTACK_DIR/.dsh/skills"` |
| 自动检测 | `setup:1410-1452` | **`dsh` 不在 PATH（本机实测）**：检测 `[ -d "$DSH_HOME" ] || command -v dsh`；显式 `--host dsh`/`INSTALL_DSH=1` 强制 |
| 运行时根 | `create_agy_runtime_root`（`setup:3391`） | 新函数 `create_dsh_runtime_root`：root=`~/.dsh/skills/gstack`；复制 router SKILL.md；`bin lib browse/dist browse/bin`；`_link_runtime_dists`（写 `.source-path`）；`_copy_runtime_skill_refs`；`ETHOS.md`；`supabase/config.sh` |
| 技能目录 | `link_agy_skill_dirs`（`setup:3422`） | 新函数 `link_dsh_skill_dirs`：遍历 `$DSH_DIR/gstack*/`，跳过 `gstack` 根，`_owned_for_windows_refresh` 所有权门 + `_link_or_copy`，`_remove_disabled_host_entry` |
| setup 臂 | `setup:3875-3899`（agy） | `_setup_arm_begin dsh global "$DSH_SKILLS"` → `_prune_stale_generated` → `link_dsh_skill_dirs` → `_activate_runtime_root create_dsh_runtime_root` → `_setup_arm_publish dsh global - ...` |
| 检测/开关清单 | `setup:1873-1881`、`setup:1459` | 加 `INSTALL_DSH` flag、`_RENDER_HOSTS_SELECTED`；错误文案补 dsh |
| 非默认路径 | `setup` 的 `_render_install`（约 `:1150` 的 `*) return 0`） | 只覆盖 claude/codex；若要支持 `DSH_HOME` 非默认，需加 dsh 分支 |
| 测试 | `test/host-conformance.test.ts:25-35` 的 `DISCOVERY`、`test/runtime-root-assets.test.ts:33-40` 的 `ROOT_BUILDERS` | 前者断言 conformance kit 覆盖每个 installable host；后者不加 `create_dsh_runtime_root` 则该 host 被静默跳过 |

安装后布局：

```
~/.dsh/skills/
├── gstack/                 # runtime root：router SKILL.md + bin/ lib/ browse/dist/ ... + .source-path
├── gstack-ship/SKILL.md    # rank 400，DSH 直接发现
├── gstack-qa/SKILL.md
└── …（62 个技能目录）
```

> 重要的 DSH 行为：`~/.dsh/skills/gstack/` 里有 SKILL.md（router），会被发现为技能 `gstack`；其子目录 `bin/`、`lib/` 等**不会被二次发现**（深度 1），所以运行时资产放在 runtime root 里是安全的。

### Phase 3 内容契约层（P3，约半天 CC+gstack）—— 已完成

> **实施状态（2026-10-28）**：catalog-trim 落成为 `HostConfig.frontmatter.catalogTrim`（`scripts/host-config.ts`），`scripts/gen-skill-docs.ts` 对非 claude host 按 `catalogTrim === true` 打开；同时启用 `descriptionLimit: 1024` + `descriptionLimitBehavior: 'error'` + `nameMatchesDirectory: true`（frontmatter 只留 `name`/`description`）。§3.5 的文档项已在本 PR 完成：`docs/ADDING_A_HOST.md` 的认证行与 DSH 节、`docs/hosts.md` 的 DSH 节、README host 矩阵、`docs/troubleshooting.md`、`docs/PROJECT_STRUCTURE.md`。

#### 3.1 工具名映射（`toolRewrites` 的完整表）

| Claude 名（gstack 模板里出现） | DSH 工具 | 备注 |
|---|---|---|
| `AskUserQuestion` | `ask_user_question` | DSH 原生支持一次多题 + 多选；gstack 的 AUQ 契约基本可平移 |
| `ExitPlanMode` | `exit_plan_mode` | DSH 有原生 plan-mode |
| Agent 工具 / Task | `subagent` / `subagent_fork` / `spawn_teammate` | gstack 的并行/编队语义在 DSH 更宽（Team + 任务板） |
| `Skill` 工具 | `skill` | `/name` 直接调用也行 |
| `TodoWrite` | `todo_write` | — |
| Read / Read tool | `read` / `ops_read_files` | — |
| Write / Edit | `write` / `edit` | — |
| Grep / Glob | `ops_grep` / `ops_glob` | — |
| Bash / BashOutput / KillShell | `ops_bash` / `job_output` / `job_kill` | — |
| WebSearch / WebFetch | `web_search` / `web_fetch` | DSH 还有 anysearch MCP，但保持主名即可 |
| MCP `mcp__server__tool` | 同名 | DSH 同命名约定 |
| NotebookEdit / SlashCommand | 无 | gstack 未使用 |

> 实现细节：`toolRewrites` 是渲染期 `replaceAll`（`scripts/gen-skill-docs.ts:609-620`），只改生成文本、不改模板源；`preambleToolGlossary()` 负责把术语表插到共享 preamble 的 `KEY: value` STATUS 行之前（`hosts/define-host.ts:74-77`），受 `PRELUDE_BYTE_BUDGET=400` 约束（`scripts/resolvers/runtime-root.ts:21`）——术语表要短，必要时把细节挪到正文而不是 preamble。

#### 3.2 路径与凭据

- `pathRewrites` 见 P1 代码；另外确认 `CLAUDE_PLUGIN_ROOT`（18 处）、`$HOME/.claude` 等残留被上述规则覆盖。
- gstack 的 `bin/gstack-paths` 状态根链（`lib/state-root.ts:22-29`）与 host 无关，DSH 下继续用 `~/.gstack`，无需改。
- 安装根的 `.source-path`（`setup:747-753`）让 `/gstack-upgrade` 找到 checkout；DSH 侧同 agy/copilot。

#### 3.3 frontmatter 与 catalog 预算

- allowlist `[name, description]` 会把 `preamble-tier`/`version`/`allowed-tools` 全部剥掉（DSH 本来也忽略它们，剥掉更省 catalog）。
- **描述长度（实测修正）**：DSH catalog 把 description 截断到 **500**（`catalogDescriptionMaxLength` 默认值）。gstack 的 catalog-trim（`applyCatalogTrim`，压成「首句 + (gstack)」、≤208）**目前只在 `host === 'claude'` 时执行**（`scripts/gen-skill-docs.ts:855`），外部 host 渲染保留完整描述：62 条里 **14 条 > 500，最长 769**（`plan-tune` 769、`office-hours` 756、`design-html` 624、`ios-qa` 616、`autoplan` 597…）。所以 §2 代码草案里的 `descriptionLimit: 500/error` 会让 `gen:skill-docs --host dsh` 直接抛错。三个选项：
- 接上：**A（推荐）** 给 `HostConfig.frontmatter` 加 `catalogTrim?: boolean`，`hosts/dsh.ts` 置 `true`，把 `gen-skill-docs.ts:855` 的条件改成 `(host === 'claude' && catalogMode === 'trim') || hostConfig.frontmatter.catalogTrim`；产出 ≤208 描述，与 Claude 行为一致。**B** `descriptionLimit: 1024/error`（对齐 agy/codex），生成不报错，但 DSH 仍按 500 截断，可能切在句中。**C** 什么都不做，接受 DSH 侧截断。
- **catalog token 成本（修正）**：DSH 每会话注入 63 条。按现状（完整描述、DSH 截断到 500）≈ 24K 字符 ≈ **6–7K tokens**；走 A 的 catalog-trim 后 ≈ 13K 字符 ≈ **3.5–4K tokens**（均为估算，未实测）。这是常驻成本；若不可接受，用 gstack 的 `disabled_skills`/`--disabled-skills` 只装子集，或改为项目级安装（rank 100）按仓库暴露。

#### 3.4 模型（`defaultModel`）

`scripts/models.ts:18-31` 没有 deepseek 家族，`hosts/dsh.ts` 不能声明 `defaultModel:'deepseek-*'`。两个选项：

| 选项 | 做法 | 代价 |
|---|---|---|
| A（推荐，先做） | 不声明 → 继承 `'claude'`（`hosts/define-host.ts:126`），渲染用 `model-overlays/claude.md` 的通用措辞 | 零代码；但中性措辞略偏 Claude |
| B（可选小 PR） | 在 `ALL_MODEL_NAMES` 加 `'deepseek-v4'` + `model-overlays/deepseek-v4.md`（可 `{{INHERIT:claude}}`），`hosts/dsh.ts` 声明 `defaultModel:'deepseek-v4'` | 需过 `test/external-host-carve.test.ts` 对 `ALL_MODEL_NAMES` 全遍历的渲染断言（`test/external-host-carve.test.ts:44-49`）与 `test/claude-overlay-models.test.ts:52-53` |

#### 3.5 内容适配清单（P3 收尾）

> 实施状态（2026-10-28）：前 4 项已随 Phase 3 落地（`$B` 保留，DSH 自有浏览器未接入、已在 `docs/hosts.md` 注明）；`CHANGELOG`/`VERSION` 未动（未授权发版，见文首「实施状态」）。

- [ ] `AskUserQuestion` prose 语义：DSH 原生工具支持多题/多选 → glossary 已声明一次多题。
- [ ] `/browse`、`/qa` 等浏览器步骤：DSH 的 `bsk_*` 更合适（P4 评估）；一期保留 `$B` 路径并在 `docs/hosts.md` 注明。
- [ ] `setup`/`skill:check`/`gen` 的 Windows 说明（gstack 模板已有 Windows 段落，cuopilot host 有先例：`hosts/copilot.ts:6-7`）。
- [ ] 文档：`docs/ADDING_A_HOST.md` 认证表、`docs/hosts.md` 的 host 说明与「Adding a host」、README 的 host 矩阵（`:434-436`）。
- [ ] `CHANGELOG`/`VERSION` 按 `/ship` 的 branch-scoped 规则；host 新增按 PATCH bump。

### Phase 4 深度能力（P4，可选，独立评估）—— 部分完成（2/5）

> **实施状态（2026-10-28）**：已落地「跨模型二次意见」（`dsh` outside-voice provider，`dsh --profile headless`，read-only）与「DSH 插件包」（`dsh-plugin/`，包名 `gstack-dsh-plugin`；未安装、未在运行中的 DSH 加载）；未做 hooks 强制化、浏览器 `bsk_*`、Team/Workflow 映射。

| 能力 | 方案 | 依赖 | 优先级 |
|---|---|---|---|
| 安全 hooks 强制化 | 用 `dsh-agent-plugins-market` 的 Claude 式 `hooks.json` 桥（10 事件、deny/ask/allow），把 `/freeze`（目录锁）、`/careful`（破坏命令拦截）、`/guard` 做成 DSH 强制门 | 该插件 + hooks 协议（本机 `~/.dsh/profiles/node_modules/@deepseek-ai/dsh-hook-protocol` 已存在） | 中 |
| 浏览器 | gstack 浏览器技能改指 DSH `bsk_*`（用户真实 Chromium、已登录态）；或继续用 `$B`（需 Bun 重建） | gstack browse 构建 / DSH 浏览器插件 | 中 |
| 跨模型二次意见 | 新增 `dsh` provider：`dsh --profile headless --json "<prompt>"` 替代 74 处 `claude -p`；`scripts/resolvers/outside-voice.ts` 加一支 | DSH CLI（已实测可用） | 高（对 `/review`、`/autoplan`、`/codex` 替代很有价值） |
| DSH 插件包 | 发布 `gstack-dsh-plugin`（npm + `dsh.bundle.patch`，零依赖）：启动时从 gstack 安装根读取 SKILL.md 并 `skills.register({...})`，或只注册 `/gstack` 命令 | DSH 插件机制（参考 uml-drawing 样例）；版本 0.2.1-rc.3 兼容性需实测 | 低（P2 的目录方案已够用） |
| Team/Workflow 映射 | gstack 的 `/review` army、`/autoplan` 的 Agent 调用改走 `spawn_teammate`/`subagent`/`workflow`；/ralph 对应 DSH ralph | 内容级改造，最大 | 低 |

---

## 4. 验收标准

### 4.1 工程门（CI 可跑）

| 阶段 | 命令 | 通过标准 |
|---|---|---|
| P1 | `bun run typecheck` | 0 error |
| P1 | `bun run gen:skill-docs --host dsh` | 生成 `.dsh/skills/` **63** 个目录；无 error/warning |
| P1 | `bun test test/host-config.test.ts test/gen-skill-docs.test.ts test/external-host-carve.test.ts test/host-renders.test.ts` | 全绿（`external-host-carve` 会自动覆盖 dsh 的 4 类断言） |
| P1 | `bun run scripts/host-config-export.ts validate` | 无校验错误 |
| P2 | `bun test test/host-conformance.test.ts` | `DISCOVERY` 覆盖 dsh；Linux CI 上安装臂断言通过（Windows 上该用例 skip，见 §5-R6） |
| P2 | `bun test test/runtime-root-assets.test.ts` | `create_dsh_runtime_root` 在 `ROOT_BUILDERS` 中，资产清单与 `sharedRuntimeRoot()` 一致（同上 skip） |
| P2 | `bash ./setup --host dsh`（或 `INSTALL_DSH=1`） | 写入 `~/.dsh/skills/gstack*/`、`.source-path`、`installs.tsv` 行；重复跑幂等 |
| P2 | `bun run skill:check` | 新 host 计入健康面板 |

> **2026-10-28 实施结果**：P1 的 `gen:skill-docs --host dsh`（63 目录）与 `host-config` / `gen-skill-docs` / `external-host-carve` 的 dsh 断言已核（除 4 个 Windows 预存失败外全绿）；P2 的 `host-conformance` 的 `DISCOVERY` 与 `runtime-root-assets` 的 `ROOT_BUILDERS` 已登记 `dsh`，但 `bash ./setup --host dsh` 与 `bun run skill:check` **未在本机执行**，所以 P2 的安装行按「未执行」看待，不能标记通过。

### 4.2 DSH 运行时验收（手工，安装后）

1. 重开 DSH 会话，问「你会哪些 gstack 技能/用 `/gstack`」→ 系统提示的 `<available_skills>` 应出现 `gstack` + **62** 个 `gstack-*`（共 **63** 条，rank 400）。
2. 直接 `/gstack-qa` 或 `/gstack` → 能加载全文并按其步骤执行（只读步骤先验）。
3. 让 agent 调 `skill` 工具读 `gstack-ship` → 返回正文 + `resourceBase` 指向 `~/.dsh/skills/gstack-ship`。
4. `bash ~/.dsh/skills/gstack/bin/gstack-paths --get GSTACK_ROOT` → 输出安装根。
5. 抽查技能内的路径：`grep -r "~/.claude" ~/.dsh/skills/gstack-ship/SKILL.md` → 应为空（或只剩无关示例）。
6. `/gstack-upgrade` 能通过 `.source-path` 找到 `C:\DevProjects\gstack-dsh`。
7. 抽测 `ops_bash` 在 Git Bash 下跑 gstack 脚本（`bin/gstack-config`、`bin/gstack-decision-search` 等）。

---

## 5. 风险与未决问题

| # | 风险 | 影响 | 应对 |
|---|---|---|---|
| R1 | **本机没有 Bun**，gstack 的 gen/build/test 全部依赖它 | 阻断 P1 之后所有步骤 | Phase 0 安装 Bun；Windows 支持是 gstack 的 curated subset（AGENTS.md「Platform support」） |
| R2 | `browse/dist`、`design/dist`、`make-pdf/dist` 是 Mach-O arm64 专有 | Windows 上 `/browse`、`/design-*`、`/make-pdf`、`/diagram` 不可用 | Phase 0 用 `bun run build` 重建；P4 用 DSH `bsk_*` 替代 |
| R3 | DSH 无用户级 hooks | `/careful`、`/freeze`、`/guard` 变为 advisory 文案，不再是硬门 | 一期接受并在 `docs/hosts.md` 写清；P4 用 market hooks 插件强制化 |
| R4 | DSH 技能发现深度 1 | 不能把 62 个技能塞进一个 `skills/gstack/` 里；gstack 现有 external render 布局恰好规避（`gstack-<name>` 扁平目录） | 保持 `hostSubdir: '.dsh'` + 外部 host 命名规则 |
| R5 | catalog 常驻成本：完整描述按 500 截断 ≈ **6–7K tokens**，做 catalog-trim 后 ≈ **3.5–4K**（估算） | 每次 DSH 会话都注入 63 条 | 可用 `--disabled-skills` 子集化；或项目级安装按仓库暴露 |
| R6 | **tier/CI 陷阱**：`experimental` 但缺 setup 臂 → `test/host-conformance.test.ts` 红；且 Windows 上 `test/runtime-root-assets.test.ts:117`、`test/host-conformance.test.ts:98` 两支关键测试 **skip** | 本机无法验证安装臂 | P1+P2 同 PR；在 Linux CI 上验证；或 P1 临时 `instruction-only` |
| R7 | 非默认安装路径的 `_render_install` 只实现 claude/codex（`setup` 约 `:1150` 的 `*) return 0`） | `DSH_HOME≠~/.dsh` 时装到错误位置 | 一期只支持默认 `~/.dsh`；或补 dsh 分支 |
| R8 | 模型家族无 deepseek → `defaultModel` 只能沿用 `claude` | 生成措辞偏 Claude | 见 §3.4 选项 A/B；B 作为独立小 PR |
| R9 | DSH 0.2.1-rc.3 是 RC，host 约定可能变 | 未来 DSH 升级可能破坏安装布局/技能格式 | 方案里所有 DSH 事实标注了版本；升级时用 `--dump-config` + asar README 复核；不把 DSH 内部路径硬编码进 gstack 代码 |
| R10 | DSH profile 由 Electron 独占管理 | `dsh plugin --profile desktop add` 可能被拒 | P4 插件包安装走 Web Plugins/`plugin_manager`，不依赖 CLI |
| R11 | 技能名冲突 | gstack 短名（`qa`、`ship`…）可能撞 DSH 内建/市场技能 | 用 `gstack-` 前缀（外部 host 默认规则 `scripts/external-skill-names.ts:1`），零冲突 |
| R12 | `~/.dsh/skills/gstack/` 含非技能子目录（bin/lib/…） | DSH 的 skills-manager UI 可能提示「目录没有 SKILL.md」类噪音 | 实测确认；必要时把 runtime root 改到 `~/.dsh/gstack`（技能目录仍平铺在 `~/.dsh/skills/gstack-*`） |

**实施后状态（2026-10-28）**

- 已消解：R1（Bun 1.4.4 可用）、R4（`.dsh/skills/` 扁平布局已按外部 host 规则落地）、R6（setup 臂 + `DISCOVERY`/`ROOT_BUILDERS` 登记；Windows 上两支安装臂用例仍 skip）、R7（改为显式拒绝非默认 `DSH_HOME`）、R8（选项 A：不声明 `defaultModel`）、R11（`gstack-` 前缀已落地）
- 部分消解：R3（advisory 已在渲染与文档中落地，P4 hooks 强制化未做）、R10（插件包已写，`dsh plugin add` 路径未实测）
- 仍开放：R2（Windows 上 browse/design/pdf 二进制是否可用未验证）、R5（catalog token 未实测）、R9（0.2.1-rc.3 是 RC）、R12（runtime root 内非技能子目录是否触发 DSH 扫描告警未实测）

### 5.1 未实测项（诚实清单）

> 以下是方案写作时的清单，保留为历史记录；关闭情况见上一条「实施后状态」。仍未关闭：DSH 会话真实加载、runtime root 子目录告警、catalog token 实测、插件安装路径、Windows 二进制。

- [ ] DSH 桌面版是否真的加载 `~/.dsh/skills`（证据来自 `dsh-skill-filesystem` README，本会话系统提示只含 16 个用户技能 + bundled，因 gstack 尚未安装，**未直接观察到 rank 400 根生效**）。
- [ ] `~/.dsh/skills` 里 runtime root 的 bin/lib 子目录是否触发 skills-manager/scan warning。
- [ ] `bun run build` 在 Windows 上产出可用 browse/design/pdf 二进制（未装 Bun，未实测）。
- [ ] `dsh --profile headless` 首次运行会初始化 profile 并消耗模型额度（未跑）。
- [ ] DSH catalog 实际 token 增量（按描述 500 截断估算 6–7K tokens，catalog-trim 后 3.5–4K）。
- [ ] `dsh plugin --profile desktop add` 是否被 Electron 管理拒绝（未测）。
- [ ] gstack 的 Windows 自由测试子集是否覆盖新 host 的渲染（`gen-skill-docs` smoke 是参数化的，理应覆盖）。

---

## 6. 需要你拍板的决策（2026-10-28 已全部拍板）

| # | 决策 | 选项 | 推荐 | 结果（2026-10-28） | 理由 |
|---|---|---|---|---|---|
| D1 | 技能命名前缀 | A. 保持短名（`ship`、`qa`）/ B. `gstack-` 前缀 | **B** | **B，已落地**：渲染目录 `gstack-<skill>`，frontmatter `name` 与目录同名 | 与 gstack 外部 host 默认规则一致；DSH 内建/市场技能无冲突；`/gstack-ship` 可读 |
| D2 | 安装范围 | A. user（`~/.dsh/skills`）/ B. project（`<repo>/.dsh/skills`）/ C. 两者 | **A 先，B 作为选项** | **A，已落地**：安装目标 `~/.dsh/skills`；checkout 的 `.dsh/skills/` 只作项目级技能根渲染 | user 级一次安装全项目可用；project 级用于隔离/仓库定制 |
| D3 | 是否做 DSH 插件包（`gstack-dsh-plugin`） | A. 不做，纯目录 + setup / B. 做 | **A 先，验证后再评估 B** | **B，已落地**（用户改判为另做独立包）：`dsh-plugin/`，未安装、未在运行中的 DSH 加载 | 目录方案零代码风险；插件封装留到 P4 |
| D4 | P4 深度能力的第一优先 | hooks 强制化 / 浏览器 bsk_* / `dsh headless` 跨模型 | **`dsh headless`** | **已落地**：`scripts/resolvers/outside-voice.ts` 的 `dsh` provider | 对 `/review`、`/autoplan` 质量提升最直接，且 CLI 已实测可用 |

---

## 7. 工作量估算

| 阶段 | 内容 | 人类团队 | CC+gstack | 压缩比 |
|---|---|---|---|---|
| P0 | 装 Bun + 环境校验 | 0.5 天 | 15 min | ~16× |
| P1 | `hosts/dsh.ts` + 注册 + 冒烟 | 0.5 天 | 15 min | ~16× |
| P2 | setup 安装臂 + runtime root + 测试 | 2 天 | 45 min | ~21× |
| P3 | 工具/路径/frontmatter/模型 + 文档 | 1 天 | 45 min | ~11× |
| P4 | hooks / 浏览器 / headless / 插件包 | 1 周 | 2–4 h | ~10× |
| **MVP（P0–P3）** | 可安装、可在 DSH 里跑 gstack | **~4 天** | **~2 h** | **~16×** |

> 数字是相对量级（按 AGENTS.md 的压缩口径）；实际以 P1 渲染 + P2 安装跑通后的实测为准。

---

## 8. 参考与证据索引

> 2026-10-28 实施后：`hosts/index.ts` 的注册表为 13 个 host（含 `dsh`）；新增 `hosts/dsh.ts`、`scripts/resolvers/outside-voice.ts` 的 `dsh` provider、`dsh-plugin/`。下文行号与文件清单是方案撰写时的状态，未逐条回填。

**gstack 侧（本仓库，行号为撰写时）**
- `scripts/host-config.ts:38-154`（HostConfig）、`hosts/define-host.ts:86-99`（sharedRuntimeRoot）、`:120-161`（默认值）、`:74-77`（preambleToolGlossary）、`:52-67`（EXEC_STYLE_TOOL_REWRITES）
- `hosts/index.ts:23`（12 host 注册表，实施后 13）、`hosts/copilot.ts` / `hosts/agy.ts`（external host 范例）、`hosts/codex.ts`（openai.yaml/抑制/转录范例）
- `scripts/gen-skill-docs.ts:609-620`（host rewrites）、`:723-777`（processExternalHost）、`:735-737`（输出路径）、`:568-594`（advisory 安全文案）、`:505-525`（frontmatter 变换）、`:962`（per-host 循环）
- `scripts/external-skill-names.ts:1-6`（`gstack-` 命名规则）
- `docs/ADDING_A_HOST.md:6-180`（新增 host 步骤/字段表/认证表）、`docs/hosts.md`、README host 矩阵 `:434-436`
- `setup:745`（`_link_runtime_dists`）、`:796`（`_copy_skill_md`）、`:806-812`（`_copy_runtime_skill_refs`）、`:1236-1237`（arm begin/publish）、`:2867`（`_activate_runtime_root`）、`:3316`/`:3391`（copilot/agy runtime root）、`:3422`（link_agy_skill_dirs）、`:3875-3899`（agy setup 臂）
- `test/host-config.test.ts:40`、`test/host-conformance.test.ts:25-35,98`、`test/runtime-root-assets.test.ts:33-40,117`、`test/external-host-carve.test.ts:24,44-49`、`test/host-renders.test.ts:45`
- `bin/gstack-host-renders.sh:27`、`bin/gstack-install-registry.sh`
- `scripts/models.ts:18-31,96-103`、`model-overlays/*.md`
- 实测计数：`AskUserQuestion` 735 文件 / `~/.claude/skills` 567 / `claude -p` 74 / `Skill(` 67 / `CLAUDE_PLUGIN_ROOT` 18；62 个技能 description 最长 769（14 条 > 500）

**DSH 侧（本机 `D:\DeepseekHarness\resources\app.asar` 内 README/源码）**
- `dsh-skill-filesystem/README.md`（技能格式、6 个扫描根与 rank、depth-1 限制）、`lib/index.js`（`parseInvocationPolicy`）
- `dsh-tool-skill/README.md`（`<available_skills>` catalog、description 截断、`skill` 工具、`/name`）
- `dsh-agent-instructions`（AGENTS.md/CLAUDE.md 链、maxBytes 65536）、`dsh-mcp-client`（MCP 配置）、`dsh-tools/README.md`（defineTool/策略/PTC）、`dsh-subagent`（provider：spawn/fork/ACP/DSH SDK/Codex/Claude Code）、`dsh-experimental-agent-team`（Lead+teammate+任务板）
- 本机实测：`dsh --version`=`0.2.1-rc.3`；`dsh headless --help`（一次性 agent，`--json`/`--session-id`）；`dsh plugin --profile web --dump-config`（web profile 201 条插件）；`dsh --profile desktop --help` → "profile 'desktop' is managed exclusively by the Electron application"
- 本机配置：`~/.dsh/profile(s)/desktop/{package.json,cordis.yml,cordis.patch.yml}`；`~/.dsh/skills` 16 个用户技能；`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-hook-protocol`
- 第三方：`dsh-agent-plugins-market@0.13.0`（Claude 式 hooks.json 桥、skill collection 规范）、`@michengai/dsh-skills-manager@1.2.20`（Global/Project skills 管理、多 agent 导入）、`uml-drawing-skill-dsh-plugin`（零依赖插件样例）

**本机核查命令（复现用）**
```bash
# 本方案写作时实际跑过的只读核查（节选）
facts:
  ls ~/.dsh/skills; ls ~/.dsh/profiles
  "D:/DeepseekHarness/resources/runtime/cli/bin/dsh.cmd" --version
  "…/dsh.cmd" headless --help
  "…/dsh.cmd" --profile web --dump-config | grep -n -iE "skill|instruction|hook"
  node .context/asar-scan.cjs "D:/DeepseekHarness/resources/app.asar" "dsh-(skill|agent-instructions|tool-skill)(/|$)"
```

---

## 9. 术语

| 术语 | 含义 |
|---|---|
| host | gstack 的渲染目标（一个 agent/CLI），由 `hosts/<name>.ts` 的 `HostConfig` 描述 |
| tier | host 的支持层级：`full`（安装+渲染+认证）、`experimental`（安装+渲染+conformance）、`instruction-only`（不安装，给复制指令） |
| profile | DSH 的插件栈（cordis patch 分层）；`web`/`tui`/`headless`/`desktop` |
| bundle | 可安装的插件包，`package.json` 里 `dsh.bundle.patch` 指向 patch 文件 |
| cordis | DSH 的插件容器（entry-list YAML，`!!js` 表达式，patch 插入/修改条目） |
| rank | DSH 技能扫描根的优先级（100 最高 → 600 bundled），同名技能按 rank 去重 |
| catalog | DSH 注入给模型的一行一技能清单（name + 截断 description），不是全文 |
| PTC | DSH 的 `run_code` 程序化工具调用模式（区别于 native function calling） |
| advisory | gstack 的「没有强制 hooks，只给提示」的宿主模式（外部 host 默认） |
