/**
 * Tests for the gstack DSH plugin: pure discovery/front-matter functions plus
 * registration behavior against a mock Cordis context.
 *
 * Run: bun test test/dsh-plugin.test.ts
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  apply,
  buildRootCandidates,
  createGstackToolDefinition,
  discoverGstackSkills,
  parseFrontmatter,
  probeGstackRoot,
  resolveGstackRoot,
  resolveOptions,
  toSkillRegistration,
} from '../dsh-plugin/index.js';
import type {
  DshPluginContext,
  GstackDiscovery,
  GstackPluginOptions,
  GstackSkill,
  GstackToolDefinition,
  GstackToolResult,
} from '../dsh-plugin/index.js';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'gstack-dsh-plugin-'));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

function writeSkill(root: string, relative: string, frontmatter: string, body = `# ${relative}\n\nbody of ${relative}`): void {
  const directory = join(root, relative);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'SKILL.md'), `---\n${frontmatter}\n---\n${body}\n`, 'utf8');
}

function gstackFrontmatter(name: string, extra = ''): string {
  return [
    `name: ${name}`,
    `description: "Skill ${name} for tests. (gstack)"`,
    'version: 1.0.0',
    extra,
  ].filter((line) => line.length > 0).join('\n');
}

/** Build a checkout-shaped installation: router SKILL.md plus one directory per skill. */
function buildCheckoutRoot(): string {
  const root = makeTempRoot();
  writeSkill(root, '.', [
    'name: gstack',
    'description: "Router for the gstack skill suite. (gstack)"',
    'version: 1.2.0',
  ].join('\n'));
  writeSkill(root, 'ship', gstackFrontmatter('ship'));
  writeSkill(root, 'review', gstackFrontmatter('review'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeSkill(root, join('node_modules', 'nested'), gstackFrontmatter('nested'));
  return root;
}

interface RegisteredSkill {
  name: string;
  description: string;
  content: string;
  source: string;
  path: string;
  resourceBase: { kind: string; path: string };
  invocation: { modelInvocable: boolean; userInvocable: boolean };
  whenToUse?: string;
  metadata?: Record<string, unknown>;
}

interface Harness {
  ctx: DshPluginContext;
  skills: RegisteredSkill[];
  tools: GstackToolDefinition[];
  labels: string[];
  unregistered: string[];
  logs: string[];
}

function createHarness(options: { withSkills?: boolean; withTools?: boolean } = {}): Harness {
  const skills: RegisteredSkill[] = [];
  const tools: GstackToolDefinition[] = [];
  const labels: string[] = [];
  const unregistered: string[] = [];
  const logs: string[] = [];
  const services: Record<string, unknown> = {};
  if (options.withSkills !== false) {
    services.skills = {
      register(registration: RegisteredSkill): () => void {
        skills.push(registration);
        return () => {
          unregistered.push(registration.name);
        };
      },
    };
  }
  if (options.withTools !== false) {
    services.tools = {
      register(definition: GstackToolDefinition): () => void {
        tools.push(definition);
        return () => {
          unregistered.push(`tool:${definition.name}`);
        };
      },
    };
  }
  const ctx: DshPluginContext = {
    get: (name: string) => services[name],
    effect: (factory: () => (() => void) | void, label?: string): (() => void) => {
      labels.push(label ?? '');
      const disposer = factory();
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        if (typeof disposer === 'function') disposer();
        labels.push(`disposed:${label ?? ''}`);
      };
    },
    logger: {
      info: (message: string) => {
        logs.push(`info:${message}`);
      },
      warn: (message: string) => {
        logs.push(`warn:${message}`);
      },
    },
  };
  return { ctx, skills, tools, labels, unregistered, logs };
}

function toolOf(harness: Harness): GstackToolDefinition {
  const tool = harness.tools[0];
  if (tool === undefined) throw new Error('no tool registered');
  return tool;
}

describe('parseFrontmatter', () => {
  test('parses quoted scalars and lists', () => {
    const raw = [
      '---',
      'name: ship',
      'description: "Ship: \\"review\\" then merge. (gstack)"',
      'version: 1.0.0',
      'allowed-tools:',
      '  - Bash',
      '  - Read',
      '---',
      '# body',
      '',
      'Ship it.',
    ].join('\n');
    const parsed = parseFrontmatter(raw);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.meta.name).toBe('ship');
    expect(parsed.meta.description).toBe('Ship: "review" then merge. (gstack)');
    expect(parsed.meta.version).toBe('1.0.0');
    expect(parsed.meta['allowed-tools']).toEqual(['Bash', 'Read']);
    expect(parsed.body).toBe('# body\n\nShip it.');
  });

  test('folds block scalars', () => {
    const raw = ['---', 'name: review', 'description: >-', '  first line', '  second line', '---', 'body'].join('\n');
    const parsed = parseFrontmatter(raw);
    expect(parsed.meta.description).toBe('first line second line');
  });

  test('keeps literal block scalars as lines', () => {
    const raw = ['---', 'name: qa', 'notes: |', '  alpha', '  beta', '---', 'body'].join('\n');
    const parsed = parseFrontmatter(raw);
    expect(parsed.meta.notes).toBe('alpha\nbeta');
  });

  test('treats a file without front matter as a body only', () => {
    const parsed = parseFrontmatter('\n# no front matter\n\ntext\n');
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.meta).toEqual({});
    expect(parsed.body).toBe('# no front matter\n\ntext');
  });

  test('handles CRLF fences', () => {
    const parsed = parseFrontmatter('---\r\nname: codex\r\ndescription: "Codex. (gstack)"\r\n---\r\nbody\r\n');
    expect(parsed.meta.name).toBe('codex');
    expect(parsed.body).toBe('body');
  });
});

describe('discoverGstackSkills', () => {
  test('discovers a router and sibling skill directories in a checkout', () => {
    const root = buildCheckoutRoot();
    const discovery: GstackDiscovery = discoverGstackSkills(root);
    expect(discovery.found).toBe(true);
    expect(discovery.root).toBe(resolve(root));
    expect(discovery.skills.map((skill) => skill.name)).toEqual(['gstack', 'review', 'ship']);
    const ship = discovery.skills.find((skill) => skill.name === 'ship') as GstackSkill;
    expect(ship.description).toBe('Skill ship for tests. (gstack)');
    expect(ship.version).toBe('1.0.0');
    expect(ship.content).toContain('body of ship');
    expect(ship.directory).toBe(join(root, 'ship'));
    expect(ship.path).toBe(join(root, 'ship', 'SKILL.md'));
    expect(ship.marked).toBe(true);
    expect(ship.prefixed).toBe(false);
    expect(ship.invocation).toEqual({ modelInvocable: true, userInvocable: true });
    expect(discovery.warnings).toEqual([]);
  });

  test('treats a checkout directory literally named gstack-dsh as the router root', () => {
    const parent = makeTempRoot();
    const root = join(parent, 'gstack-dsh');
    writeSkill(root, '.', 'name: gstack\ndescription: "Router for the suite. (gstack)"');
    writeSkill(root, 'ship', gstackFrontmatter('ship'));
    const discovery = discoverGstackSkills(root);
    expect(discovery.skills.map((skill) => skill.name)).toEqual(['gstack', 'ship']);
    const router = discovery.skills[0] as GstackSkill;
    expect(router.name).toBe('gstack');
    expect(router.prefixed).toBe(false);
    expect(router.path).toBe(join(root, 'SKILL.md'));
  });

  test('accepts a prefixed flat install and ignores unrelated skill directories', () => {
    const root = makeTempRoot();
    writeSkill(root, 'gstack-ship', 'name: ship\ndescription: "Ship skill. (gstack)"');
    writeSkill(root, 'gstack-review', 'name: review\ndescription: "Review skill. (gstack)"');
    writeSkill(root, 'ef-docs', 'name: ef-docs\ndescription: "A user skill, not gstack."');
    writeSkill(root, 'plain', 'name: plain\ndescription: "No marker, no router."');
    const discovery = discoverGstackSkills(root);
    expect(discovery.skills.map((skill) => skill.name)).toEqual(['gstack-review', 'gstack-ship']);
    expect(discovery.skills.every((skill) => skill.prefixed)).toBe(true);
  });

  test('reads invocation controls from front matter', () => {
    const root = buildCheckoutRoot();
    writeSkill(root, 'freeze', `${gstackFrontmatter('freeze')}\ndisable-model-invocation: true`);
    const discovery = discoverGstackSkills(root);
    const freeze = discovery.skills.find((skill) => skill.name === 'freeze') as GstackSkill;
    expect(freeze.invocation).toEqual({ modelInvocable: false, userInvocable: true });
  });

  test('skips malformed skill files with a warning', () => {
    const root = buildCheckoutRoot();
    writeSkill(root, 'broken', 'name: "Not A Valid Name"');
    const discovery = discoverGstackSkills(root);
    expect(discovery.skills.map((skill) => skill.name)).toEqual(['gstack', 'review', 'ship']);
    expect(discovery.warnings.some((warning) => warning.includes('broken'))).toBe(true);
  });

  test('keeps the first skill when two entries share a name', () => {
    const root = buildCheckoutRoot();
    writeSkill(root, 'misc', gstackFrontmatter('ship'));
    const discovery = discoverGstackSkills(root);
    expect(discovery.skills.filter((skill) => skill.name === 'ship').length).toBe(1);
    expect(discovery.warnings.some((warning) => warning.includes('重名'))).toBe(true);
  });

  test('reports a missing root instead of throwing', () => {
    const discovery = discoverGstackSkills(join(makeTempRoot(), 'nope'));
    expect(discovery.found).toBe(false);
    expect(discovery.skills).toEqual([]);
    expect(discovery.warnings.some((warning) => warning.includes('不存在'))).toBe(true);
  });
});

describe('probeGstackRoot and root resolution', () => {
  test('probes checkout, prefixed and empty directories', () => {
    const checkout = buildCheckoutRoot();
    expect(probeGstackRoot(checkout)).toBe(true);
    const prefixed = makeTempRoot();
    writeSkill(prefixed, 'gstack-ship', gstackFrontmatter('ship'));
    expect(probeGstackRoot(prefixed)).toBe(true);
    expect(probeGstackRoot(makeTempRoot())).toBe(false);
    expect(probeGstackRoot(join(checkout, 'missing'))).toBe(false);
  });

  test('orders candidates config > GSTACK_ROOT > DSH_HOME > home', () => {
    const home = makeTempRoot();
    const dshHome = join(home, 'dsh-home');
    const candidates = buildRootCandidates({
      env: { DSH_HOME: dshHome, GSTACK_ROOT: join(home, 'gstack-env') },
      home,
    });
    expect(candidates[0]).toBe(join(home, 'gstack-env'));
    expect(candidates).toContain(join(dshHome, 'skills', 'gstack'));
    expect(candidates).toContain(join(home, '.dsh', 'skills', 'gstack'));
    expect(buildRootCandidates({ root: join(home, 'explicit'), env: { GSTACK_ROOT: join(home, 'gstack-env') }, home }))
      .toEqual([join(home, 'explicit')]);
  });

  test('deduplicates the home fallbacks when DSH_HOME is unset', () => {
    const home = makeTempRoot();
    const candidates = buildRootCandidates({ env: {}, home });
    expect(candidates).toEqual([join(home, '.dsh', 'skills', 'gstack'), join(home, '.dsh', 'skills')]);
  });

  test('picks the first candidate that actually holds gstack skills', () => {
    const home = makeTempRoot();
    const emptyDsh = join(home, 'dsh-home');
    mkdirSync(join(emptyDsh, 'skills', 'gstack'), { recursive: true });
    const envRoot = buildCheckoutRoot();
    const resolution = resolveGstackRoot({ env: { GSTACK_ROOT: envRoot, DSH_HOME: emptyDsh }, home });
    expect(resolution.reason).toBe('found');
    expect(resolution.root).toBe(resolve(envRoot));
    expect(resolution.discovery?.skills.length).toBe(3);
  });

  test('falls through a stale GSTACK_ROOT to DSH_HOME', () => {
    const home = makeTempRoot();
    const dshHome = join(home, 'dsh-home');
    const installed = join(dshHome, 'skills', 'gstack');
    writeSkill(installed, '.', 'name: gstack\ndescription: "Router. (gstack)"');
    writeSkill(installed, 'ship', gstackFrontmatter('ship'));
    const resolution = resolveGstackRoot({ env: { GSTACK_ROOT: join(home, 'stale'), DSH_HOME: dshHome }, home });
    expect(resolution.root).toBe(resolve(installed));
    expect(resolution.discovery?.skills.map((skill) => skill.name)).toEqual(['gstack', 'ship']);
  });

  test('outranks a setup runtime root that only carries a few payload skills', () => {
    // `./setup --host dsh` installs the skills as flat siblings under
    // <DSH_HOME>/skills while <DSH_HOME>/skills/gstack is a router-plus-payload
    // runtime root. The first candidate must not win just by being enumerated
    // first; the root that discovers the most skills does.
    const home = makeTempRoot();
    const dshHome = join(home, 'dsh-home');
    const skillsDir = join(dshHome, 'skills');
    writeSkill(skillsDir, 'gstack', 'name: gstack\ndescription: "Router. (gstack)"');
    writeSkill(skillsDir, 'gstack/upgrade', gstackFrontmatter('upgrade'));
    writeSkill(skillsDir, 'gstack-ship', gstackFrontmatter('ship'));
    writeSkill(skillsDir, 'gstack-qa', gstackFrontmatter('qa'));
    const resolution = resolveGstackRoot({ env: { DSH_HOME: dshHome }, home });
    expect(resolution.reason).toBe('found');
    expect(resolution.root).toBe(resolve(skillsDir));
    expect(resolution.discovery?.skills.map((skill) => skill.name)).toEqual(['gstack', 'gstack-qa', 'gstack-ship']);
  });

  test('returns null with candidates when nothing is installed', () => {
    const home = makeTempRoot();
    const resolution = resolveGstackRoot({ env: {}, home });
    expect(resolution.root).toBeNull();
    expect(resolution.reason).toBe('missing');
    expect(resolution.candidates.length).toBeGreaterThan(0);
  });
});

describe('resolveOptions and registration shape', () => {
  test('applies defaults and reads overrides', () => {
    const defaults: GstackPluginOptions = resolveOptions(undefined);
    expect(defaults.enabled).toBe(true);
    expect(defaults.auto).toBe(true);
    expect(defaults.includeRouter).toBe(true);
    expect(defaults.root).toBeUndefined();
    expect(defaults.exclude).toEqual([]);
    expect(defaults.toolName).toBe('gstack');

    const custom = resolveOptions({ enabled: false, auto: false, includeRouter: false, root: ' C:\\gstack ', exclude: ['gstack-qa', 7], toolName: 'gstack_status' });
    expect(custom.enabled).toBe(false);
    expect(custom.auto).toBe(false);
    expect(custom.includeRouter).toBe(false);
    expect(custom.root).toBe('C:\\gstack');
    expect(custom.exclude).toEqual(['gstack-qa']);
    expect(custom.toolName).toBe('gstack_status');

    expect(resolveOptions({ enabled: 'yes' }).enabled).toBe(true);
    expect(resolveOptions({ root: '   ' }).root).toBeUndefined();
  });

  test('builds a bundled registration with a directory resource base', () => {
    const root = buildCheckoutRoot();
    const ship = discoverGstackSkills(root).skills.find((skill) => skill.name === 'ship') as GstackSkill;
    const registration = toSkillRegistration(ship);
    expect(registration.name).toBe('ship');
    expect(registration.source).toBe('bundled');
    expect(registration.path).toBe(join(root, 'ship', 'SKILL.md'));
    expect(registration.resourceBase).toEqual({ kind: 'directory', path: join(root, 'ship') });
    expect(registration.content).toContain('body of ship');
    expect(registration.metadata).toEqual({ version: '1.0.0', gstackRoot: join(root, 'ship') });
  });
});

describe('apply', () => {
  test('registers every discovered skill and the gstack tool, then disposes all', () => {
    const root = buildCheckoutRoot();
    const harness = createHarness();
    const dispose = apply(harness.ctx, { root });

    expect(harness.skills.map((skill) => skill.name)).toEqual(['gstack', 'review', 'ship']);
    expect(harness.skills.every((skill) => skill.source === 'bundled')).toBe(true);
    const ship = harness.skills.find((skill) => skill.name === 'ship') as RegisteredSkill;
    expect(ship.resourceBase).toEqual({ kind: 'directory', path: join(root, 'ship') });
    expect(harness.tools.map((tool) => tool.name)).toEqual(['gstack']);
    expect(harness.labels).toContain('gstack-dsh skill ship');
    expect(harness.logs.some((line) => line.startsWith('info:') && line.includes('已注册 3 个 gstack 技能'))).toBe(true);

    dispose();
    expect(harness.unregistered.sort()).toEqual(['gstack', 'review', 'ship', 'tool:gstack'].sort());
  });

  test('auto: false keeps the catalog empty and only registers the tool', async () => {
    const root = buildCheckoutRoot();
    const harness = createHarness();
    apply(harness.ctx, { root, auto: false });

    expect(harness.skills).toEqual([]);
    expect(harness.tools.length).toBe(1);
    expect(harness.logs.some((line) => line.includes('auto: false'))).toBe(true);

    const result: GstackToolResult = await toolOf(harness).execute({});
    expect(result.found).toBe(true);
    expect(result.auto).toBe(false);
    expect(result.registered).toBe(0);
    expect(result.count).toBe(3);
  });

  test('enabled: false registers neither skills nor tool', () => {
    const root = buildCheckoutRoot();
    const harness = createHarness();
    apply(harness.ctx, { root, enabled: false });

    expect(harness.skills).toEqual([]);
    expect(harness.tools).toEqual([]);
    expect(harness.labels).toEqual([]);
    expect(harness.logs.some((line) => line.includes('enabled: false'))).toBe(true);
  });

  test('a missing installation root degrades quietly to the tool', async () => {
    const missingRoot = join(makeTempRoot(), 'missing');
    const harness = createHarness();
    apply(harness.ctx, { root: missingRoot });

    expect(harness.skills).toEqual([]);
    expect(harness.tools.length).toBe(1);
    expect(harness.logs.some((line) => line.startsWith('warn:') && line.includes('未找到 gstack 技能'))).toBe(true);

    const result: GstackToolResult = await toolOf(harness).execute({});
    expect(result.found).toBe(false);
    expect(result.root).toBe('');
    expect(result.text).toContain('候选路径');
    expect(result.text).toContain(missingRoot);
  });

  test('honors exclude and includeRouter', () => {
    const root = buildCheckoutRoot();
    const harness = createHarness();
    apply(harness.ctx, { root, exclude: ['review'], includeRouter: false });
    expect(harness.skills.map((skill) => skill.name)).toEqual(['ship']);
  });

  test('registers the tool but no skills when the skills service is absent', () => {
    const root = buildCheckoutRoot();
    const harness = createHarness({ withSkills: false });
    apply(harness.ctx, { root });
    expect(harness.skills).toEqual([]);
    expect(harness.tools.length).toBe(1);
    expect(harness.logs.some((line) => line.includes('skills 服务不可用'))).toBe(true);
  });

  test('a plugin without a tools service still registers skills', () => {
    const root = buildCheckoutRoot();
    const harness = createHarness({ withTools: false });
    apply(harness.ctx, { root });
    expect(harness.skills.length).toBe(3);
    expect(harness.logs.some((line) => line.startsWith('warn:') && line.includes('tools 服务不可用'))).toBe(true);
  });
});

describe('gstack tool', () => {
  test('reports root, skills and registration state for summary and full detail', async () => {
    const root = buildCheckoutRoot();
    const harness = createHarness();
    apply(harness.ctx, { root });
    const tool = toolOf(harness);

    const summary: GstackToolResult = await tool.execute({});
    expect(summary.found).toBe(true);
    expect(summary.root).toBe(resolve(root));
    expect(summary.count).toBe(3);
    expect(summary.registered).toBe(3);
    expect(summary.skills.map((skill) => skill.name)).toEqual(['gstack', 'review', 'ship']);
    expect(summary.skills.every((skill) => skill.registered)).toBe(true);
    expect(summary.text).toContain('gstack, review, ship');
    expect(summary.text).toContain(resolve(root));

    const full: GstackToolResult = await tool.execute({ detail: 'full' });
    expect(full.detail).toBe('full');
    expect(full.text).toContain(join(root, 'ship', 'SKILL.md'));
    expect(tool.output.render({}, full)).toEqual([{ type: 'text', text: full.text }]);
  });

  test('reflects a later install without restarting the plugin', async () => {
    const root = makeTempRoot();
    const harness = createHarness();
    apply(harness.ctx, { root });
    expect(harness.skills).toEqual([]);

    writeSkill(root, '.', 'name: gstack\ndescription: "Router. (gstack)"');
    writeSkill(root, 'ship', gstackFrontmatter('ship'));
    const result: GstackToolResult = await toolOf(harness).execute({ detail: 'full' });
    expect(result.found).toBe(true);
    expect(result.registered).toBe(0);
    expect(result.count).toBe(2);
    expect(result.text).toContain('未注册');
  });
});
