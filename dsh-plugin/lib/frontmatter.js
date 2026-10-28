/**
 * SKILL.md front matter reader for the gstack DSH plugin.
 *
 * gstack SKILL.md files use a small YAML subset: scalar keys, quoted or plain
 * scalars, folded (`>`) / literal (`|`) block scalars and simple `- item`
 * lists. This reader supports exactly that subset so the bundle keeps zero
 * runtime dependencies. It is deliberately not a general YAML parser: front
 * matter outside this subset is out of contract for a DSH skill file.
 *
 * @typedef {{ meta: Record<string, string | string[]>, body: string, hasFrontmatter: boolean }} SkillFrontmatter
 */

const FRONTMATTER_PATTERN = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)?/;

/**
 * Remove one layer of YAML quoting and decode the escapes gstack writes.
 * Double-quoted values go through JSON so `\"` / `\n` decode correctly;
 * single-quoted values only need `''` collapsed to `'`.
 * @param {string} raw
 * @returns {string}
 */
export function unquote(raw) {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).split("''").join("'");
  }
  return value;
}

/**
 * Parse the lines between the `---` fences into a flat metadata record.
 * @param {string} block
 * @returns {Record<string, string | string[]>}
 */
export function parseMetadata(block) {
  /** @type {Record<string, string | string[]>} */
  const meta = {};
  /** @type {string | undefined} */
  let currentKey;
  /** @type {'scalar' | 'literal' | 'folded' | 'list' | 'pending'} */
  let mode = 'scalar';
  /** @type {string[]} */
  let buffer = [];

  const commit = () => {
    if (currentKey === undefined) return;
    if (mode === 'list') meta[currentKey] = buffer;
    else if (mode === 'literal') meta[currentKey] = buffer.join('\n').trim();
    else if (mode === 'folded') meta[currentKey] = buffer.join(' ').trim();
    else meta[currentKey] = buffer.join(' ').trim();
    currentKey = undefined;
    mode = 'scalar';
    buffer = [];
  };

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      // A blank line inside a block scalar is a real newline; elsewhere it ends nothing.
      if (mode === 'literal' || mode === 'folded') buffer.push('');
      continue;
    }
    const indented = /^[ \t]/.test(line);
    if (indented) {
      const item = /^[ \t]*-[ \t]+(.*)$/.exec(line);
      if (item !== null && (mode === 'list' || mode === 'pending')) {
        mode = 'list';
        buffer.push(unquote(item[1]));
        continue;
      }
      if (mode === 'pending') mode = 'scalar';
      if (mode === 'literal') {
        buffer.push(line.replace(/^[ \t]+/, ''));
        continue;
      }
      if (mode === 'folded' || mode === 'scalar' || mode === 'list') {
        // Plain-scalar continuation (and a list item the regex above missed).
        buffer.push(trimmed);
        continue;
      }
      continue;
    }
    const topLevelItem = /^-[ \t]+(.*)$/.exec(line);
    if (topLevelItem !== null && (mode === 'list' || mode === 'pending')) {
      mode = 'list';
      buffer.push(unquote(topLevelItem[1]));
      continue;
    }
    const pair = /^([A-Za-z0-9_.-]+):[ \t]*(.*)$/.exec(line);
    if (pair === null) continue;
    commit();
    currentKey = pair[1];
    buffer = [];
    const rest = pair[2].trim();
    if (rest.startsWith('>')) mode = 'folded';
    else if (rest.startsWith('|')) mode = 'literal';
    else if (rest.length === 0) mode = 'pending';
    else {
      meta[currentKey] = unquote(rest);
      currentKey = undefined;
      mode = 'scalar';
    }
  }
  commit();
  return meta;
}

/**
 * Split a SKILL.md file into front matter metadata and the instruction body.
 * Files without front matter keep their whole text as the body.
 * @param {string} raw
 * @returns {SkillFrontmatter}
 */
export function parseFrontmatter(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const match = FRONTMATTER_PATTERN.exec(text);
  if (match === null) return { meta: {}, body: text.trim(), hasFrontmatter: false };
  return {
    meta: parseMetadata(match[1]),
    body: text.slice(match[0].length).trim(),
    hasFrontmatter: true,
  };
}
