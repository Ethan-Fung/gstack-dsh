/**
 * Type declarations for the gstack DSH plugin's public surface.
 * The implementation is plain ESM JavaScript (no build step); these types exist
 * for tests, editors and bundle consumers.
 */

/** Invocation controls accepted by the DSH skill registry. */
export interface SkillInvocation {
  /** Whether the model-facing catalog and loader include the skill. */
  modelInvocable: boolean;
  /** Whether human-facing command catalogs include the skill. */
  userInvocable: boolean;
}

/** One discovered gstack SKILL.md, before it is registered. */
export interface GstackSkill {
  /** Addressable kebab-case name; `gstack-*` directories keep their prefixed name. */
  name: string;
  description: string;
  whenToUse?: string;
  version?: string;
  /** Absolute directory holding SKILL.md. */
  directory: string;
  /** Absolute path of SKILL.md. */
  path: string;
  /** Markdown body with the front matter removed. */
  content: string;
  /** Whether the directory itself carries the `gstack-` install prefix. */
  prefixed: boolean;
  /** Whether the front matter description carries gstack's generated marker. */
  marked: boolean;
  invocation: SkillInvocation;
}

/** Result of scanning one installation root. */
export interface GstackDiscovery {
  root: string | undefined;
  skills: GstackSkill[];
  warnings: string[];
  found: boolean;
}

/**
 * Result of resolving the installation root among the candidate chain.
 *
 * `root` is the explicit root when one is configured, else the candidate whose
 * discovery yields the most skills, so a `setup` runtime root holding only a few
 * payload skills cannot shadow the flat install beside it.
 */
export interface GstackResolution {
  root: string | null;
  discovery?: GstackDiscovery;
  candidates: string[];
  reason: 'found' | 'missing';
}

/** Effective plugin options read from the raw patch-row config. */
export interface GstackPluginOptions {
  enabled: boolean;
  auto: boolean;
  includeRouter: boolean;
  root?: string;
  exclude: string[];
  toolName: string;
}

/** Host logger surface; both methods are optional. */
export interface DshPluginLogger {
  info?(message: string): void;
  warn?(message: string): void;
}

/** Minimal Cordis context surface this plugin uses. */
export interface DshPluginContext {
  get?(name: string): unknown;
  effect?(factory: () => (() => void) | void, label?: string): () => void;
  logger?: DshPluginLogger;
}

/** Parsed SKILL.md front matter plus body. */
export interface FrontmatterResult {
  meta: Record<string, string | string[]>;
  body: string;
  hasFrontmatter: boolean;
}

/** Structured result returned by the `gstack` tool. */
export interface GstackToolResult {
  root: string;
  found: boolean;
  auto: boolean;
  registered: number;
  count: number;
  skills: Array<{ name: string; description: string; directory: string; registered: boolean }>;
  candidates: string[];
  detail: 'summary' | 'full';
  text: string;
}

/** Read-only tool definition accepted by `ctx.tools.register()`. */
export interface GstackToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render(args: unknown, value: GstackToolResult): Array<{ type: 'text'; text: string }>;
  };
  execute(args?: { detail?: 'summary' | 'full' }, exec?: unknown): Promise<GstackToolResult>;
}

export function parseFrontmatter(raw: string): FrontmatterResult;

export function buildRootCandidates(options?: {
  root?: string;
  env?: Record<string, string | undefined>;
  home?: string;
}): string[];

export function discoverGstackSkills(root: string | undefined): GstackDiscovery;

export function probeGstackRoot(directory: string): boolean;

export function resolveGstackRoot(options?: {
  root?: string;
  env?: Record<string, string | undefined>;
  home?: string;
}): GstackResolution;

export function resolveOptions(config: unknown): GstackPluginOptions;

export function toSkillRegistration(skill: GstackSkill): Record<string, unknown>;

export function createGstackToolDefinition(
  options: GstackPluginOptions,
  state: { registered: Set<string> },
): GstackToolDefinition;

/** Cordis plugin entry; returns one disposer for every contribution. */
export function apply(ctx: DshPluginContext, config?: unknown): () => void;
