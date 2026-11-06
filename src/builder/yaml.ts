/**
 * The site's YAML files, changed in place. `patchYaml` walks the parsed file and
 * touches only what differs, so comments, quoting and key order all stay, and the
 * diff shows what the editor did and nothing else.
 *
 * Pass raw documents, never parsed ones: zod's defaults would end up in the file.
 */
import { Document, isMap, isNode, isScalar, isSeq, Pair, parseDocument, visit } from 'yaml';
import type { Node, Scalar, ToStringOptions, YAMLMap, YAMLSeq } from 'yaml';
import { same } from './persist/merge';

type Doc = Record<string, unknown>;

/** The ones Sveltia writes with (formatYAML), so the two tools agree on every file. */
export const YAML_OPTIONS: ToStringOptions = {
  indent: 2,
  indentSeq: true,
  lineWidth: 0,
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
  singleQuote: true,
};

// Sveltia quotes these too: a YAML 1.1 parser would read them as booleans or numbers.
const YAML_1_1_BOOL = /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
const YAML_1_1_NUMBER =
  /^[-+]?(?:0b[01_,]+|0[0-7_,]+|0x[\da-fA-F_,]+|(?:\d[\d_,]*)?\.[\d_,]*(?:[eE][-+]?\d+)?|\d[\d_,]*|\d[\d_]*(?::[0-5]?\d)+(?:\.[\d_]*)?)$/;

const isDoc = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Sveltia's rule for `omit_empty_optional_fields`. `false` and `0` are values. */
const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && !value.length) ||
  (isDoc(value) && !Object.keys(value).length);

function withoutEmpties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutEmpties);
  if (!isDoc(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, withoutEmpties(item)] as const)
      .filter(([, item]) => !isEmpty(item))
  );
}

function create(doc: Document, value: unknown): Node {
  // A fresh copy, which also keeps an object used twice from becoming a YAML alias.
  const node = doc.createNode(withoutEmpties(value)) as Node;
  visit(node, {
    Scalar(_key, scalar) {
      if (typeof scalar.value === 'string' && (YAML_1_1_BOOL.test(scalar.value) || YAML_1_1_NUMBER.test(scalar.value))) {
        scalar.type = 'QUOTE_SINGLE';
      }
    },
  });
  return node;
}

/** A new value keeps its old quotes, unless it is now several lines. */
function keepStyle(old: Scalar, fresh: Scalar) {
  if (typeof old.value !== 'string' || typeof fresh.value !== 'string') return;
  const lines = fresh.value.includes('\n');
  const quoted = old.type === 'QUOTE_DOUBLE' || old.type === 'QUOTE_SINGLE';
  const block = old.type === 'BLOCK_LITERAL' || old.type === 'BLOCK_FOLDED';
  if ((quoted && !lines) || (block && lines)) fresh.type = old.type;
}

function replace(doc: Document, old: unknown, next: unknown): Node {
  const fresh = create(doc, next);
  if (isScalar(old) && isScalar(fresh)) keepStyle(old, fresh);
  if (isNode(old)) {
    fresh.comment = old.comment;
    fresh.commentBefore = old.commentBefore;
    fresh.spaceBefore = old.spaceBefore;
  }
  return fresh;
}

const keyOf = (pair: Pair) => String(isScalar(pair.key) ? pair.key.value : pair.key);

const valueOf = (doc: Document, node: unknown): unknown => (isNode(node) ? node.toJS(doc) : node);

function insert(map: YAMLMap, pair: Pair, order: readonly string[]) {
  const key = keyOf(pair);
  const at = order.indexOf(key);
  const indexOf = (name: string) => map.items.findIndex((item) => keyOf(item) === name);
  const before = order.slice(0, at).findLast((name) => indexOf(name) >= 0);
  if (before !== undefined) {
    map.items.splice(indexOf(before) + 1, 0, pair);
    return;
  }
  const after = order.slice(at + 1).find((name) => indexOf(name) >= 0);
  map.items.splice(after === undefined ? map.items.length : indexOf(after), 0, pair);
}

function patchMap(doc: Document, map: YAMLMap, next: Doc, keyOrder?: readonly string[]) {
  map.items = map.items.filter((pair) => next[keyOf(pair)] !== undefined);
  if (!map.items.length) map.flow = false;

  for (const [key, value] of Object.entries(next)) {
    const pair = map.items.find((item) => keyOf(item) === key);
    const empty = isEmpty(withoutEmpties(value));
    if (!pair) {
      if (!empty) insert(map, new Pair(create(doc, key), create(doc, value)), keyOrder?.includes(key) ? keyOrder : Object.keys(next));
    } else if (!same(valueOf(doc, pair.value), value)) {
      if (empty) map.items.splice(map.items.indexOf(pair), 1);
      else pair.value = patch(doc, pair.value, value, keyOrder);
    }
  }
}

/**
 * Items that stayed the same keep their node, wherever they moved to. One that
 * changed keeps its node too, found by its `id` or else by its place, so a single
 * edit in a long list leaves the rest of the list alone.
 */
function patchSeq(doc: Document, seq: YAMLSeq, next: unknown[], keyOrder?: readonly string[]) {
  const nodes = seq.items;
  const values = nodes.map((node) => valueOf(doc, node));
  const free = new Set(nodes.keys());
  const items = new Array<unknown>(next.length);

  const claim = (from: number, to: number) => {
    free.delete(from);
    items[to] = same(values[from], next[to]) ? nodes[from] : patch(doc, nodes[from], next[to], keyOrder);
  };
  const unplaced = () => [...next.keys()].filter((i) => !(i in items));
  const find = (test: (value: unknown) => boolean) => [...free].find((i) => test(values[i]));

  for (const i of unplaced()) if (free.has(i) && same(values[i], next[i])) claim(i, i);
  for (const i of unplaced()) {
    const from = find((value) => same(value, next[i]));
    if (from !== undefined) claim(from, i);
  }
  for (const i of unplaced()) {
    const id = isDoc(next[i]) ? next[i].id : undefined;
    const from = id === undefined ? undefined : find((value) => isDoc(value) && value.id === id);
    if (from !== undefined) claim(from, i);
  }
  for (const i of unplaced()) {
    if (free.has(i) && isDoc(values[i]) === isDoc(next[i])) claim(i, i);
    else items[i] = create(doc, next[i]);
  }

  if (!nodes.length) seq.flow = false;
  seq.items = items;
}

function patch(doc: Document, node: unknown, next: unknown, keyOrder?: readonly string[]): Node {
  if (isMap(node) && isDoc(next)) {
    patchMap(doc, node, next, keyOrder);
    return node;
  }
  if (isSeq(node) && Array.isArray(next)) {
    patchSeq(doc, node, next, keyOrder);
    return node;
  }
  return replace(doc, node, next);
}

/**
 * The file with `next` written over it. Untouched lines stay as they are, and a
 * key that became empty goes. A new key takes its place from `keyOrder`, or else
 * from the order of `next`.
 */
export function patchYaml(text: string, next: unknown, keyOrder?: string[]): string {
  // Git keeps these files with LF, but a Windows working copy has CRLF.
  const crlf = text.includes('\r\n');
  const doc = parseDocument(crlf ? text.replaceAll('\r\n', '\n') : text);
  if (doc.errors.length) throw new Error('This file is damaged, so the builder can’t change it. Ask your developer to take a look.', { cause: doc.errors[0] });
  if (same(doc.toJS(), next)) return text;
  if (doc.contents === null) return newYaml(next);

  doc.contents = patch(doc, doc.contents, next, keyOrder) as typeof doc.contents;
  const out = doc.toString(YAML_OPTIONS);
  return crlf ? out.replaceAll('\n', '\r\n') : out;
}

/** A new file, as Sveltia would write it. */
export function newYaml(value: unknown): string {
  const doc = new Document();
  doc.contents = create(doc, value) as typeof doc.contents;
  return `${doc.toString(YAML_OPTIONS).trim()}\n`;
}
