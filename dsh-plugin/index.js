/**
 * gstack DSH plugin: expose a gstack installation to DeepSeek Harness.
 *
 * On apply it resolves one gstack installation root (patch config > GSTACK_ROOT
 * > `$DSH_HOME/skills/gstack` > `$DSH_HOME/skills` > `~/.dsh/skills/gstack` >
 * `~/.dsh/skills`), discovers every SKILL.md there and registers each one with
 * `source: 'bundled'`, then registers
 * one read-only `gstack` tool that reports the resolved root and the discovered
 * skill set. With no installation root it degrades quietly to the tool alone and
 * logs the candidate paths it tried. When several candidates hold skills the one
 * whose discovery yields the most skills wins: `setup` leaves a runtime root at
 * `$DSH_HOME/skills/gstack` that carries only a few payload skills and would
 * otherwise shadow the flat `gstack-*` install beside it.
 *
 * Zero runtime dependencies on purpose: a bundle installed from a local
 * directory may be linked outside the profile's module chain, so only `node:`
 * builtins and this package's own files are imported. The plugin never installs
 * anything, never writes to DSH_HOME, and never edits another plugin's config.
 */
import { discoverGstackSkills, resolveGstackRoot } from './lib/discovery.js';

/** Log and effect label prefix. */
const PREFIX = 'gstack-dsh';

/** Default tool name; configurable because `/gstack` is user-facing naming. */
const DEFAULT_TOOL_NAME = 'gstack';

/**
 * Read the effective plugin options out of the raw patch-row config.
 * No schema dependency: each field is validated defensively here.
 * @param {unknown} config
 * @returns {{ enabled: boolean, auto: boolean, includeRouter: boolean, root?: string, exclude: string[], toolName: string }}
 */
export function resolveOptions(config) {
  const raw = config !== null && typeof config === 'object' ? /** @type {Record<string, unknown>} */ (config) : {};
  return {
    enabled: raw.enabled !== false,
    auto: raw.auto !== false,
    includeRouter: raw.includeRouter !== false,
    root: typeof raw.root === 'string' && raw.root.trim().length > 0 ? raw.root.trim() : undefined,
    exclude: Array.isArray(raw.exclude) ? raw.exclude.filter((entry) => typeof entry === 'string') : [],
    toolName: typeof raw.toolName === 'string' && raw.toolName.trim().length > 0 ? raw.toolName.trim() : DEFAULT_TOOL_NAME,
  };
}

/**
 * Build a logger that prefers the host ctx logger and otherwise stays silent
 * except for warnings, so a plugin loaded without a logger never crashes boot.
 * @param {{ logger?: { info?: (message: string) => void, warn?: (message: string) => void } } | undefined} ctx
 * @returns {{ info: (message: string) => void, warn: (message: string) => void }}
 */
function createLogger(ctx) {
  /** @param {'info' | 'warn'} level @param {string} message */
  const forward = (level, message) => {
    const target = ctx?.logger;
    const method = target === undefined ? undefined : target[level];
    const text = `[${PREFIX}] ${message}`;
    if (typeof method === 'function') {
      method.call(target, text);
      return;
    }
    if (level === 'warn') console.warn(text);
  };
  return { info: (message) => forward('info', message), warn: (message) => forward('warn', message) };
}

/**
 * Convert one discovered skill into the registry's registration shape.
 * `source: 'bundled'` keeps the entry answerable from the session catalog, and
 * `resourceBase` lets the loaded body resolve relative resource paths.
 * @param {import('./lib/discovery.js').GstackSkill} skill
 * @returns {Record<string, unknown>}
 */
export function toSkillRegistration(skill) {
  /** @type {Record<string, unknown>} */
  const registration = {
    name: skill.name,
    description: skill.description,
    content: skill.content,
    source: 'bundled',
    path: skill.path,
    resourceBase: { kind: 'directory', path: skill.directory },
    invocation: skill.invocation,
  };
  if (skill.whenToUse !== undefined) registration.whenToUse = skill.whenToUse;
  if (skill.version !== undefined) registration.metadata = { version: skill.version, gstackRoot: skill.directory };
  return registration;
}

/**
 * Register one skill on the plugin's fiber so unloading the plugin removes it.
 * Mirrors the documented `ctx.effect(() => register(), label)` pattern.
 * @param {{ effect?: (factory: () => (() => void) | void, label?: string) => () => void }} ctx
 * @param {{ register: (registration: Record<string, unknown>) => () => void }} skillsService
 * @param {import('./lib/discovery.js').GstackSkill} skill
 * @returns {() => void}
 */
function registerSkill(ctx, skillsService, skill) {
  const registration = toSkillRegistration(skill);
  const register = () => skillsService.register(registration);
  if (typeof ctx.effect !== 'function') return register();
  const dispose = ctx.effect(register, `${PREFIX} skill ${skill.name}`);
  return typeof dispose === 'function' ? dispose : register;
}

/**
 * Human-readable status for the tool result.
 * @param {ReturnType<typeof resolveOptions>} options
 * @param {import('./lib/discovery.js').GstackResolution} resolution
 * @param {import('./lib/discovery.js').GstackDiscovery} discovery
 * @param {Set<string>} registered
 * @param {'summary' | 'full'} detail
 * @returns {string}
 */
function formatToolText(options, resolution, discovery, registered, detail) {
  /** @type {string[]} */
  const lines = [];
  if (resolution.root === null || !discovery.found) {
    lines.push('未找到 gstack 安装根，插件已降级为仅注册 gstack 工具（不注册任何技能）。');
    lines.push('候选路径（按优先级）：');
    for (const candidate of resolution.candidates) lines.push(`- ${candidate}`);
    if (resolution.candidates.length === 0) lines.push('- （无候选）');
    lines.push('用 patch 配置 root，或设置环境变量 GSTACK_ROOT 指向 gstack 安装目录。');
    return lines.join('\n');
  }
  lines.push(`gstack 安装根：${resolution.root}`);
  if (options.root !== undefined) lines.push('根来源：插件配置 root');
  lines.push(
    `发现 ${discovery.skills.length} 个技能；本次会话启动时已注册 ${registered.size} 个`
    + (options.auto ? '（auto: true）' : '（auto: false，仅列出清单）'),
  );
  if (detail === 'full') {
    for (const skill of discovery.skills) {
      lines.push(`- ${skill.name}（${registered.has(skill.name) ? '已注册' : '未注册'}）  ${skill.path}`);
    }
  } else {
    lines.push(discovery.skills.map((skill) => skill.name).join(', '));
  }
  if (discovery.warnings.length > 0) lines.push(`警告 ${discovery.warnings.length} 条，详细清单见插件日志。`);
  return lines.join('\n');
}

/**
 * Build the read-only `gstack` tool definition bound to one plugin instance.
 * The tool re-resolves and re-discovers on every call so a later install shows
 * up without restarting, but it never registers skills by itself.
 * @param {ReturnType<typeof resolveOptions>} options
 * @param {{ registered: Set<string> }} state
 * @returns {Record<string, unknown>}
 */
export function createGstackToolDefinition(options, state) {
  return {
    name: options.toolName,
    description:
      '列出当前 gstack 安装根、发现的 gstack 技能，以及本次会话启动时已注册的技能数量。'
      + '只读：不安装、不修改文件、不改配置；用于确认 gstack 是否被 DSH 正确发现。',
    parameters: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          enum: ['summary', 'full'],
          description: 'summary 只列技能名，full 附每个技能的 SKILL.md 路径与注册状态。',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          root: { type: 'string', description: '解析到的 gstack 安装根；未找到时为空字符串。' },
          found: { type: 'boolean', description: '是否发现至少一个 gstack 技能。' },
          auto: { type: 'boolean', description: '插件当前 auto 配置值。' },
          registered: { type: 'number', description: '启动时实际注册进技能目录的数量。' },
          count: { type: 'number', description: '本次发现的技能数量。' },
          skills: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                directory: { type: 'string' },
                registered: { type: 'boolean' },
              },
              required: ['name', 'description', 'directory', 'registered'],
              additionalProperties: false,
            },
          },
          candidates: { type: 'array', items: { type: 'string' }, description: '按优先级尝试过的安装根候选。' },
          detail: { type: 'string', enum: ['summary', 'full'] },
          text: { type: 'string', description: '给模型与用户看的一段结论。' },
        },
        required: ['root', 'found', 'auto', 'registered', 'count', 'skills', 'candidates', 'detail', 'text'],
        additionalProperties: false,
      },
      render(_args, value) {
        return [{ type: 'text', text: value.text }];
      },
    },
    async execute(args) {
      const detail = args !== null && typeof args === 'object' && args.detail === 'full' ? 'full' : 'summary';
      let resolution;
      try {
        resolution = resolveGstackRoot({ root: options.root, env: process.env });
      } catch (error) {
        resolution = { root: null, candidates: [], reason: 'missing' };
        return {
          root: '',
          found: false,
          auto: options.auto,
          registered: state.registered.size,
          count: 0,
          skills: [],
          candidates: [],
          detail,
          text: `解析 gstack 安装根失败：${error instanceof Error ? error.message : String(error)}`,
        };
      }
      const discovery = resolution.discovery ?? discoverGstackSkills(resolution.root ?? undefined);
      const skills = discovery.skills.map((skill) => ({
        name: skill.name,
        description: skill.description,
        directory: skill.directory,
        registered: state.registered.has(skill.name),
      }));
      return {
        root: resolution.root ?? '',
        found: discovery.found,
        auto: options.auto,
        registered: state.registered.size,
        count: skills.length,
        skills,
        candidates: resolution.candidates,
        detail,
        text: formatToolText(options, resolution, discovery, state.registered, detail),
      };
    },
  };
}

/**
 * Cordis plugin entry: resolve the installation root, register its skills, and
 * register the `gstack` tool. Returns one disposer for every contribution.
 * @param {{ get?: (name: string) => unknown, effect?: (factory: () => (() => void) | void, label?: string) => () => void, logger?: { info?: (message: string) => void, warn?: (message: string) => void } }} ctx
 * @param {unknown} [config]
 * @returns {() => void}
 */
export function apply(ctx, config) {
  const options = resolveOptions(config);
  const log = createLogger(ctx);
  /** @type {Array<() => void>} */
  const disposers = [];
  /** @type {{ registered: Set<string> }} */
  const state = { registered: new Set() };

  if (!options.enabled) {
    log.info('插件已在配置里关闭（enabled: false），本次不注册技能也不注册工具。');
    return () => {};
  }

  let resolution;
  try {
    resolution = resolveGstackRoot({ root: options.root, env: process.env });
  } catch (error) {
    log.warn(`解析 gstack 安装根失败：${error instanceof Error ? error.message : String(error)}；仅注册 ${options.toolName} 工具。`);
    resolution = { root: null, candidates: [], reason: 'missing' };
  }
  const discovery = resolution.discovery ?? discoverGstackSkills(resolution.root ?? undefined);
  for (const warning of discovery.warnings) log.warn(warning);
  if (!discovery.found) {
    log.warn(
      `未找到 gstack 技能，仅注册 ${options.toolName} 工具。候选路径：`
      + (resolution.candidates.length > 0 ? resolution.candidates.join('；') : '（无）')
      + '。可用配置 root 或环境变量 GSTACK_ROOT 指定安装根。',
    );
  }

  const skillsService = ctx.get?.('skills');
  const toolsService = ctx.get?.('tools');

  if (options.auto && discovery.found) {
    if (skillsService !== undefined && typeof (/** @type {{ register?: unknown }} */ (skillsService)).register === 'function') {
      for (const skill of discovery.skills) {
        if (!options.includeRouter && skill.name === 'gstack') continue;
        if (options.exclude.includes(skill.name)) continue;
        try {
          disposers.push(registerSkill(ctx, /** @type {{ register: (registration: Record<string, unknown>) => () => void }} */ (skillsService), skill));
          state.registered.add(skill.name);
        } catch (error) {
          log.warn(`注册技能 ${skill.name} 失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
      log.info(`已注册 ${state.registered.size} 个 gstack 技能（source: bundled），安装根：${resolution.root ?? ''}`);
    } else {
      log.warn('skills 服务不可用，gstack 技能未注册；仅注册工具。');
    }
  } else if (!options.auto && discovery.found) {
    log.info(`auto: false，发现 ${discovery.skills.length} 个 gstack 技能但未注册；${options.toolName} 工具可列出清单。`);
  }

  if (toolsService !== undefined && typeof (/** @type {{ register?: unknown }} */ (toolsService)).register === 'function') {
    const definition = createGstackToolDefinition(options, state);
    const register = () => /** @type {{ register: (definition: Record<string, unknown>) => () => void }} */ (toolsService).register(definition);
    disposers.push(typeof ctx.effect === 'function' ? ctx.effect(register, `${PREFIX} tool ${options.toolName}`) : register());
  } else {
    log.warn(`tools 服务不可用，${options.toolName} 工具未注册。`);
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        if (typeof dispose === 'function') dispose();
      } catch {
        // A failing disposer must not block the remaining teardown.
      }
    }
  };
}

export { parseFrontmatter } from './lib/frontmatter.js';
export { buildRootCandidates, discoverGstackSkills, probeGstackRoot, resolveGstackRoot } from './lib/discovery.js';
