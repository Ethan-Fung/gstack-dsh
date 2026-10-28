/**
 * Discovery for the gstack DSH plugin: resolve a gstack installation root and
 * turn every SKILL.md under it into one runtime-skill candidate.
 *
 * Two layouts are supported because gstack ships in both:
 * - checkout / nested install: `<root>/SKILL.md` is the `gstack` router and each
 *   skill is a direct child directory (`<root>/ship/SKILL.md`). `./setup`
 *   produces this shape for `~/.claude/skills/gstack` (the DSH analogue is
 *   `$DSH_HOME/skills/gstack`).
 * - prefixed flat install: each skill is `<root>/gstack-ship/SKILL.md`, which is
 *   what `./setup --prefix` installs directly into a skills directory.
 *
 * Only direct children are scanned. `@deepseek-ai/dsh-skill-filesystem` also
 * discovers only direct `<name>/SKILL.md` entries, so nested SKILL.md files are
 * out of contract for a DSH skill tree.
 *
 * Zero runtime dependencies: `node:` builtins plus ./frontmatter.js.
 *
 * @typedef {{ kind: 'directory', path: string }} SkillResourceBase
 * @typedef {{
 *   name: string,
 *   description: string,
 *   whenToUse?: string,
 *   version?: string,
 *   directory: string,
 *   path: string,
 *   content: string,
 *   prefixed: boolean,
 *   marked: boolean,
 *   invocation: { modelInvocable: boolean, userInvocable: boolean },
 * }} GstackSkill
 * @typedef {{ root: string | undefined, skills: GstackSkill[], warnings: string[], found: boolean }} GstackDiscovery
 * @typedef {{ root: string | null, discovery?: GstackDiscovery, candidates: string[], reason: 'found' | 'missing' }} GstackResolution
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

/** The public skill-name grammar shared by the DSH skill registry. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Every generated gstack skill description ends with this marker. */
export const GSTACK_DESCRIPTION_MARKER = '(gstack)';

/** Directories under an installation root that are never skill directories. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build']);

/** @param {string} path @returns {boolean} */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** @param {string} path @returns {boolean} */
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** @param {string} path @returns {string | undefined} */
function readTextFile(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** @param {unknown} value @returns {string | undefined} */
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Read one scalar front matter key as a non-empty string.
 * @param {Record<string, string | string[]>} meta
 * @param {string} key
 * @returns {string | undefined}
 */
function scalar(meta, key) {
  return nonEmptyString(meta[key]);
}

/**
 * Inspect one candidate skill directory.
 * @param {string} directory absolute directory that may hold SKILL.md
 * @param {{ prefixed?: boolean }} [options] force/disable the `gstack-` install-prefix reading
 * @returns {{ kind: 'skill', skill: GstackSkill } | { kind: 'missing' } | { kind: 'invalid', path: string, reason: string }}
 */
export function readSkillDirectory(directory, options = {}) {
  const file = join(directory, 'SKILL.md');
  if (!isFile(file)) return { kind: 'missing' };
  const raw = readTextFile(file);
  if (raw === undefined) return { kind: 'invalid', path: file, reason: 'SKILL.md 无法读取' };
  const { meta, body } = parseFrontmatter(raw);
  const directoryName = basename(directory);
  const prefixed = options.prefixed
    ?? (directoryName.startsWith('gstack-') && SKILL_NAME_PATTERN.test(directoryName));
  const frontmatterName = scalar(meta, 'name');
  const name = prefixed ? directoryName : frontmatterName;
  if (name === undefined || !SKILL_NAME_PATTERN.test(name)) {
    return { kind: 'invalid', path: file, reason: `SKILL.md 缺少合法的 name（目录 ${directoryName}）` };
  }
  const frontmatterDescription = scalar(meta, 'description');
  const whenToUse = scalar(meta, 'whenToUse') ?? scalar(meta, 'when-to-use');
  const version = scalar(meta, 'version');
  return {
    kind: 'skill',
    skill: {
      name,
      description: frontmatterDescription ?? `gstack 技能 ${name}`,
      ...(whenToUse === undefined ? {} : { whenToUse }),
      ...(version === undefined ? {} : { version }),
      directory,
      path: file,
      content: body,
      prefixed,
      marked: frontmatterDescription !== undefined && frontmatterDescription.endsWith(GSTACK_DESCRIPTION_MARKER),
      invocation: {
        modelInvocable: scalar(meta, 'disable-model-invocation') !== 'true',
        userInvocable: scalar(meta, 'user-invocable') !== 'false',
      },
    },
  };
}

/**
 * Discover the router and skill directories under one resolved installation root.
 * @param {string | undefined} root
 * @returns {GstackDiscovery}
 */
export function discoverGstackSkills(root) {
  /** @type {GstackDiscovery} */
  const result = { root: root === undefined ? undefined : resolve(root), skills: [], warnings: [], found: false };
  if (result.root === undefined) {
    result.warnings.push('未解析到 gstack 安装根');
    return result;
  }
  if (!isDirectory(result.root)) {
    result.warnings.push(`gstack 安装根不存在或不是目录：${result.root}`);
    return result;
  }

  const seen = new Set();
  /** @param {GstackSkill} skill */
  const add = (skill) => {
    if (seen.has(skill.name)) {
      result.warnings.push(`技能 ${skill.name} 重名，保留第一个（${skill.path}），跳过后续同名条目`);
      return;
    }
    seen.add(skill.name);
    result.skills.push(skill);
  };

  // The installation root itself is the router, never a prefixed child skill:
  // a checkout directory may legitimately be named `gstack-dsh` while its
  // SKILL.md front matter declares `name: gstack`.
  const rootEntry = readSkillDirectory(result.root, { prefixed: false });
  const rootLooksLikeGstack = rootEntry.kind === 'skill'
    && (rootEntry.skill.name === 'gstack' || basename(result.root) === 'gstack');
  if (rootEntry.kind === 'skill' && rootLooksLikeGstack) add(rootEntry.skill);
  else if (rootEntry.kind === 'invalid') result.warnings.push(`跳过安装根本身的 SKILL.md：${rootEntry.path}（${rootEntry.reason}）`);

  let names;
  try {
    names = readdirSync(result.root).sort();
  } catch (error) {
    result.warnings.push(`无法读取安装根目录：${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
  for (const name of names) {
    if (name.startsWith('.') || SKIPPED_DIRECTORIES.has(name)) continue;
    const directory = join(result.root, name);
    if (!isDirectory(directory)) continue;
    const entry = readSkillDirectory(directory);
    if (entry.kind === 'missing') continue;
    if (entry.kind === 'invalid') {
      result.warnings.push(`跳过 ${entry.path}：${entry.reason}`);
      continue;
    }
    // Accept gstack-* directories, anything under a checkout-shaped root, and
    // any SKILL.md carrying gstack's generated description marker.
    if (!entry.skill.prefixed && !rootLooksLikeGstack && !entry.skill.marked) continue;
    add(entry.skill);
  }

  result.skills.sort((a, b) => {
    if (a.name === b.name) return 0;
    if (a.name === 'gstack') return -1;
    if (b.name === 'gstack') return 1;
    return a.name.localeCompare(b.name);
  });
  result.found = result.skills.length > 0;
  return result;
}

/**
 * Cheap probe: does this directory look like a gstack installation root?
 * Used to pick between candidates without reading every SKILL.md up front.
 * @param {string} directory
 * @returns {boolean}
 */
export function probeGstackRoot(directory) {
  if (!isDirectory(directory)) return false;
  if (isFile(join(directory, 'SKILL.md'))) return true;
  let names;
  try {
    names = readdirSync(directory);
  } catch {
    return false;
  }
  return names.some((name) => name.startsWith('gstack-') && isFile(join(directory, name, 'SKILL.md')));
}

/**
 * Ordered installation-root candidates: an explicit patch config wins, then
 * `GSTACK_ROOT`, then the DSH skills directory, then the same path under the
 * home directory. An explicit `root` is authoritative: no fallback.
 * @param {{ root?: string, env?: Record<string, string | undefined>, home?: string }} [options]
 * @returns {string[]}
 */
export function buildRootCandidates(options = {}) {
  const { root, env = {}, home = homedir() } = options;
  const explicitRoot = nonEmptyString(root);
  if (explicitRoot !== undefined) return [resolve(explicitRoot)];
  /** @type {string[]} */
  const candidates = [];
  /** @param {string} candidate */
  const add = (candidate) => {
    const normalized = resolve(candidate);
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };
  const dshHome = nonEmptyString(env.DSH_HOME) ?? join(home, '.dsh');
  const gstackRoot = nonEmptyString(env.GSTACK_ROOT);
  if (gstackRoot !== undefined) add(gstackRoot);
  add(join(dshHome, 'skills', 'gstack'));
  add(join(home, '.dsh', 'skills', 'gstack'));
  add(join(dshHome, 'skills'));
  add(join(home, '.dsh', 'skills'));
  return candidates;
}

/**
 * Resolve the installation root among the candidate chain and discover its skills.
 * @param {{ root?: string, env?: Record<string, string | undefined>, home?: string }} [options]
 * @returns {GstackResolution}
 */
export function resolveGstackRoot(options = {}) {
  const candidates = buildRootCandidates(options);
  /**
   * The first probed candidate can be a decoy: `./setup` puts a runtime root at
   * `<DSH_HOME>/skills/gstack` that itself holds a router SKILL.md and a few
   * payload skill directories, while the installed skills live next to it as
   * `<DSH_HOME>/skills/gstack-<skill>`. Enumeration order therefore cannot
   * decide the root; the candidate that discovers the most skills does.
   */
  let best;
  for (const candidate of candidates) {
    if (!probeGstackRoot(candidate)) continue;
    const discovery = discoverGstackSkills(candidate);
    if (discovery.skills.length === 0) continue;
    if (best === undefined || discovery.skills.length > best.discovery.skills.length) {
      best = { root: candidate, discovery, candidates, reason: 'found' };
    }
  }
  return best ?? { root: null, candidates, reason: 'missing' };
}
