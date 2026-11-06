/**
 * GitHub in memory, for the builder's specs: one implementation behind a function
 * that takes a request and returns a response, so unit specs call it through
 * `fake.fetch` and Playwright through `routeFakeGithub`.
 *
 * It holds real state (commits, refs, pull requests, check runs) and refuses what
 * GitHub refuses, in GitHub's words. GraphQL is parsed and run field by field, so
 * a field GitHub doesn't have fails here too. Two things are simpler than the real
 * one: merges compare whole files, not lines, and mergeability is never "still
 * being worked out" unless a spec says so with `blockMerge`.
 */
import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { PREVIEW_CHECK, REPO, TEST_CHECK } from '../../src/builder/persist/types';

export const FAKE_TOKEN = 'gho_faketokenforthebuildersspecs';

const API = 'https://api.github.com';
const REPO_PATH = `/repos/${REPO.owner}/${REPO.name}`;

/** Blob.text stops here. */
const GRAPHQL_TEXT_LIMIT = 512 * 1024;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Authorization, Content-Type',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
  'access-control-expose-headers': 'Retry-After, X-RateLimit-Remaining',
};

export interface FakeRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | null;
}

export interface FakeResponse {
  /** 0 means the connection failed. */
  status: number;
  headers: Record<string, string>;
  body: string | Uint8Array;
}

export interface FakeCheckRun {
  id?: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: string | null;
  details_url?: string;
  output?: { title?: string; summary?: string; text?: string };
}

export interface FakeOptions {
  files: Record<string, string | Uint8Array>;
  login?: string;
  permission?: 'ADMIN' | 'MAINTAIN' | 'WRITE' | 'TRIAGE' | 'READ';
  /** The repository's "automatically delete head branches" setting. */
  deleteBranchOnMerge?: boolean;
  /** Report every build as passed as soon as its commit lands, for specs that aren't about builds. */
  instantChecks?: boolean;
}

interface Commit {
  oid: string;
  parents: string[];
  /** Every file at this commit: path to blob id. */
  files: Map<string, string>;
  message: string;
}

interface Pull {
  number: number;
  id: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  crossRepository: boolean;
  mergeOid?: string;
}

const sha1 = (...parts: (string | Uint8Array)[]) => {
  const hash = createHash('sha1');
  parts.forEach((part) => hash.update(part));
  return hash.digest('hex');
};

const bytesOf = (content: string | Uint8Array) => (typeof content === 'string' ? new TextEncoder().encode(content) : content);

/** Git's own blob id, so a spec can compare it with a real one. */
export const blobOid = (content: string | Uint8Array) => {
  const bytes = bytesOf(content);
  return sha1(`blob ${bytes.length}\0`, bytes);
};

const json = (status: number, value: unknown, headers: Record<string, string> = {}): FakeResponse => ({
  status,
  headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', ...headers },
  body: JSON.stringify(value),
});

const empty = (status: number): FakeResponse => ({ status, headers: CORS, body: '' });

const notFound = () => json(404, { message: 'Not Found' });

/** A failure GraphQL reports with a 200. */
interface GraphqlFailure extends Error {
  graphql: true;
  type?: string;
}

const refusal = (message: string, type?: string): GraphqlFailure => Object.assign(new Error(message), { graphql: true as const, type });

const isRefusal = (error: unknown): error is GraphqlFailure => (error as GraphqlFailure | null)?.graphql === true;

// GraphQL, as far as the backend speaks it.

type Value = unknown;

interface FieldNode {
  alias: string;
  name: string;
  args: Record<string, Value>;
  selection: Selection[] | null;
}

interface InlineFragment {
  on: string;
  selection: Selection[];
}

type Selection = FieldNode | InlineFragment;

const TOKEN = /\s+|,|\.\.\.|[{}()[\]:$!=]|"(?:[^"\\]|\\.)*"|-?\d+|[_A-Za-z]\w*/y;

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < source.length) {
    const at = TOKEN.lastIndex;
    const match = TOKEN.exec(source);
    if (!match) throw refusal(`Parse error at "${source.slice(at, at + 20)}"`);
    if (!/^[\s,]/.test(match[0])) tokens.push(match[0]);
  }
  return tokens;
}

function parseOperation(source: string, variables: Record<string, Value>): { kind: string; selection: Selection[] } {
  const tokens = tokenize(source);
  let at = 0;
  const take = (expected?: string) => {
    const token = tokens[at++];
    if (token === undefined || (expected !== undefined && token !== expected)) {
      throw refusal(`Parse error: expected ${expected ?? 'more'}, found ${token ?? 'the end'}`);
    }
    return token;
  };

  const value = (): Value => {
    const token = take();
    if (token === '$') {
      const name = take();
      if (!(name in variables)) throw refusal(`Variable $${name} of type was not provided.`);
      return variables[name];
    }
    if (token === '[') {
      const list: Value[] = [];
      while (tokens[at] !== ']') list.push(value());
      take(']');
      return list;
    }
    if (token.startsWith('"')) return JSON.parse(token);
    if (/^-?\d/.test(token)) return Number(token);
    return token;
  };

  const selectionSet = (): Selection[] => {
    take('{');
    const selection: Selection[] = [];
    while (tokens[at] !== '}') {
      if (tokens[at] === '...') {
        take('...');
        take('on');
        const on = take();
        selection.push({ on, selection: selectionSet() });
        continue;
      }
      const alias = take();
      let name = alias;
      if (tokens[at] === ':') {
        take(':');
        name = take();
      }
      const args: Record<string, Value> = {};
      if (tokens[at] === '(') {
        take('(');
        while (tokens[at] !== ')') {
          const key = take();
          take(':');
          args[key] = value();
        }
        take(')');
      }
      selection.push({ alias, name, args, selection: tokens[at] === '{' ? selectionSet() : null });
    }
    take('}');
    return selection;
  };

  let kind = 'query';
  if (tokens[at] === 'query' || tokens[at] === 'mutation') {
    kind = take();
    if (tokens[at] !== '{' && tokens[at] !== '(') take();
    if (tokens[at] === '(') {
      take('(');
      while (tokens[at] !== ')') {
        take('$');
        const name = take();
        if (!(name in variables)) throw refusal(`Variable $${name} was declared but not provided.`);
        take(':');
        while (tokens[at] !== ')' && tokens[at] !== '$') at++;
      }
      take(')');
    }
  }
  const selection = selectionSet();
  if (at !== tokens.length) throw refusal('Parse error: text after the operation');
  return { kind, selection };
}

type GraphqlObject = { __typename: string } & Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Resolvers = Record<string, Record<string, (parent: any, args: any) => unknown>>;

function run(selection: Selection[], object: GraphqlObject, types: Resolvers): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const node of selection) {
    if ('on' in node) {
      if (node.on === object.__typename) Object.assign(result, run(node.selection, object, types));
      continue;
    }
    const field = types[object.__typename]?.[node.name];
    if (!field) throw refusal(`Field '${node.name}' doesn't exist on type '${object.__typename}'`, 'undefinedField');
    result[node.alias] = complete(field(object, node.args), node, types);
  }
  return result;
}

function complete(value: unknown, node: FieldNode, types: Resolvers): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => complete(item, node, types));
  if (typeof value !== 'object') return value;
  if (!node.selection) throw refusal(`Field must have selections: ${node.name}`);
  return run(node.selection, value as GraphqlObject, types);
}

export type FakeGithub = ReturnType<typeof createFakeGithub>;

export function createFakeGithub({ files, login = 'patricia', permission: startingPermission = 'WRITE', deleteBranchOnMerge = true, instantChecks = false }: FakeOptions) {
  let permission = startingPermission;
  const blobs = new Map<string, Uint8Array>();
  const commits = new Map<string, Commit>();
  const refs = new Map<string, string>();
  const pulls: Pull[] = [];
  const checks = new Map<string, FakeCheckRun[]>();
  const requests: FakeRequest[] = [];
  const failures: { match: (request: FakeRequest) => boolean; response: FakeResponse }[] = [];
  let forcedMergeState: { state: string; times: number } | null = null;
  let counter = 0;
  let checkId = 0;

  const canPush = () => ['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission);

  function addBlob(content: string | Uint8Array): string {
    const oid = blobOid(content);
    blobs.set(oid, bytesOf(content));
    return oid;
  }

  function addCommit(parent: string | null, changed: Record<string, string | Uint8Array | null>, message: string): string {
    const tree = new Map(parent ? commits.get(parent)!.files : []);
    for (const [path, content] of Object.entries(changed)) {
      if (content === null) tree.delete(path);
      else tree.set(path, addBlob(content));
    }
    const oid = sha1('commit', String(++counter), parent ?? '', message);
    commits.set(oid, { oid, parents: parent ? [parent] : [], files: tree, message });
    if (instantChecks && !/^\[skip ci\]/i.test(message)) {
      setCheck(oid, { name: PREVIEW_CHECK, status: 'completed', conclusion: 'success' });
      setCheck(oid, { name: TEST_CHECK, status: 'completed', conclusion: 'success' });
    }
    return oid;
  }

  function setCheck(oid: string, run: FakeCheckRun) {
    const runs = checks.get(oid) ?? [];
    runs.push({ ...run, id: ++checkId, conclusion: run.conclusion ?? null });
    checks.set(oid, runs);
  }

  /** Oldest first, following first parents. */
  function history(oid: string): Commit[] {
    const list: Commit[] = [];
    for (let commit = commits.get(oid); commit; commit = commits.get(commit.parents[0])) list.unshift(commit);
    return list;
  }

  const headOf = (pull: Pull) => refs.get(pull.head);

  /** Where a pull request's branch left its base. */
  function forkPoint(pull: Pull): Commit | undefined {
    const head = headOf(pull);
    if (!head) return undefined;
    const onBase = new Set(history(refs.get(pull.base)!).map(({ oid }) => oid));
    return history(head).findLast(({ oid }) => onBase.has(oid));
  }

  function pullCommits(pull: Pull): Commit[] {
    const head = headOf(pull);
    if (!head) return [];
    const fork = forkPoint(pull);
    return history(head).filter((commit) => !fork || !history(fork.oid).some(({ oid }) => oid === commit.oid));
  }

  function changedPaths(from: Commit, to: Commit): string[] {
    return [...new Set([...from.files.keys(), ...to.files.keys()])].filter((path) => from.files.get(path) !== to.files.get(path));
  }

  /** Files both sides changed differently, which is what stops a merge here. */
  function conflicts(pull: Pull): string[] {
    const head = headOf(pull);
    const fork = forkPoint(pull);
    if (!head || !fork) return [];
    const [theirs, ours] = [commits.get(refs.get(pull.base)!)!, commits.get(head)!];
    return changedPaths(fork, ours).filter((path) => {
      const mine = ours.files.get(path);
      const main = theirs.files.get(path);
      return main !== fork.files.get(path) && main !== mine;
    });
  }

  function mergeState(pull: Pull): string {
    if (forcedMergeState?.times) return forcedMergeState.state;
    if (pull.draft) return 'DRAFT';
    return conflicts(pull).length ? 'DIRTY' : 'CLEAN';
  }

  function deleteRef(branch: string) {
    refs.delete(branch);
    // GitHub closes a pull request whose head branch goes.
    for (const pull of pulls) if (pull.head === branch && pull.state === 'OPEN') pull.state = 'CLOSED';
  }

  // Revision expressions: a branch, or a commit id, then a colon and a path.
  function resolveRev(rev: string): Commit | undefined {
    const oid = refs.get(rev.replace(/^refs\/heads\//, '')) ?? rev;
    return commits.get(oid);
  }

  const treeOid = (commit: Commit, dir: string) => sha1('tree', commit.oid, dir);

  const treeObject = (commit: Commit, dir: string): GraphqlObject => ({ __typename: 'Tree', oid: treeOid(commit, dir), commit, dir });

  const blobObject = (oid: string): GraphqlObject => ({ __typename: 'Blob', oid });

  const commitObject = (commit: Commit): GraphqlObject => ({ __typename: 'Commit', ...commit, commit });

  function objectAt(expression: string): GraphqlObject | null {
    const split = expression.indexOf(':');
    const commit = split < 0 ? resolveRev(expression) : resolveRev(expression.slice(0, split));
    if (!commit) return null;
    if (split < 0) return commitObject(commit);
    const path = expression.slice(split + 1);
    const oid = commit.files.get(path);
    if (oid) return blobObject(oid);
    const isFolder = [...commit.files.keys()].some((file) => file.startsWith(`${path}/`));
    return isFolder ? treeObject(commit, path) : null;
  }

  function treeEntries({ commit, dir }: { commit: Commit; dir: string }): GraphqlObject[] {
    const seen = new Map<string, GraphqlObject>();
    for (const [path, oid] of commit.files) {
      if (!path.startsWith(`${dir}/`)) continue;
      const [name, ...deeper] = path.slice(dir.length + 1).split('/');
      seen.set(
        name,
        deeper.length
          ? { __typename: 'TreeEntry', name, type: 'tree', oid: treeOid(commit, `${dir}/${name}`), object: treeObject(commit, `${dir}/${name}`) }
          : { __typename: 'TreeEntry', name, type: 'blob', oid, object: blobObject(oid) }
      );
    }
    return [...seen.values()];
  }

  const isBinary = (bytes: Uint8Array) => bytes.includes(0);

  const pullObject = (pull: Pull): GraphqlObject => ({ __typename: 'PullRequest', pull });

  const nodes = (list: unknown[]) => ({ __typename: 'Connection', nodes: list });

  const types: Resolvers = {
    Query: {
      viewer: () => ({ __typename: 'User', login }),
      repository: (_, { owner, name }) => (owner === REPO.owner && name === REPO.name ? { __typename: 'Repository' } : null),
    },
    User: { login: ({ login: value }) => value },
    Repository: {
      id: () => 'R_fake',
      viewerPermission: () => permission,
      ref: (_, { qualifiedName }) => {
        const name = String(qualifiedName).replace(/^refs\/heads\//, '');
        return refs.has(name) ? { __typename: 'Ref', name } : null;
      },
      object: (_, { expression, oid }) => {
        if (expression !== undefined) return objectAt(expression);
        if (blobs.has(oid)) return blobObject(oid);
        return commits.has(oid) ? commitObject(commits.get(oid)!) : null;
      },
      pullRequest: (_, { number }) => {
        const pull = pulls.find((item) => item.number === number);
        return pull ? pullObject(pull) : null;
      },
      pullRequests: (_, { headRefName, baseRefName, states, first }) =>
        nodes(
          pulls
            .filter(
              (pull) =>
                (headRefName === undefined || pull.head === headRefName) &&
                (baseRefName === undefined || pull.base === baseRefName) &&
                (states === undefined || [states].flat().includes(pull.state))
            )
            .slice(0, first)
            .map(pullObject)
        ),
    },
    Ref: {
      name: ({ name }) => name,
      target: ({ name }) => commitObject(commits.get(refs.get(name)!)!),
    },
    Commit: {
      oid: ({ oid }) => oid,
      message: ({ message }) => message,
      parents: ({ parents }, { first }) => nodes((parents as string[]).slice(0, first).map((oid) => commitObject(commits.get(oid)!))),
    },
    Connection: { nodes: ({ nodes: list }) => list },
    Tree: { oid: ({ oid }) => oid, entries: (tree) => treeEntries(tree) },
    TreeEntry: {
      name: ({ name }) => name,
      type: ({ type }) => type,
      oid: ({ oid }) => oid,
      object: ({ object }) => object,
    },
    Blob: {
      oid: ({ oid }) => oid,
      byteSize: ({ oid }) => blobs.get(oid)!.length,
      isBinary: ({ oid }) => isBinary(blobs.get(oid)!),
      isTruncated: ({ oid }) => !isBinary(blobs.get(oid)!) && blobs.get(oid)!.length > GRAPHQL_TEXT_LIMIT,
      text: ({ oid }) => {
        const bytes = blobs.get(oid)!;
        return isBinary(bytes) ? null : new TextDecoder().decode(bytes.subarray(0, GRAPHQL_TEXT_LIMIT));
      },
    },
    PullRequest: {
      id: ({ pull }) => pull.id,
      number: ({ pull }) => pull.number,
      url: ({ pull }) => `https://github.com/${REPO.owner}/${REPO.name}/pull/${pull.number}`,
      title: ({ pull }) => pull.title,
      isDraft: ({ pull }) => pull.draft,
      state: ({ pull }) => pull.state,
      merged: ({ pull }) => pull.state === 'MERGED',
      isCrossRepository: ({ pull }) => pull.crossRepository,
      mergeStateStatus: ({ pull }) => mergeState(pull),
      mergeCommit: ({ pull }) => (pull.mergeOid ? commitObject(commits.get(pull.mergeOid)!) : null),
      commits: ({ pull }, { first }) => nodes(pullCommits(pull).slice(0, first).map((commit) => ({ __typename: 'PullRequestCommit', commit: commitObject(commit) }))),
      files: ({ pull }, { first }) => {
        const head = headOf(pull);
        const fork = forkPoint(pull);
        const paths = head && fork ? changedPaths(fork, commits.get(head)!) : [];
        return nodes(paths.slice(0, first).map((path) => ({ __typename: 'PullRequestChangedFile', path })));
      },
    },
    PullRequestCommit: { commit: ({ commit }) => commit },
    PullRequestChangedFile: { path: ({ path }) => path },
    Mutation: {
      createRef: (_, { input }) => {
        requireWrite('CreateRef');
        const name = String(input.name).replace(/^refs\/heads\//, '');
        if (refs.has(name)) throw refusal(`A ref named "${input.name}" already exists in the repository.`, 'UNPROCESSABLE');
        if (!commits.has(input.oid)) throw refusal(`Object "${input.oid}" does not exist.`, 'UNPROCESSABLE');
        refs.set(name, input.oid);
        return { __typename: 'CreateRefPayload', ref: { __typename: 'Ref', name } };
      },
      createCommitOnBranch: (_, { input }) => {
        requireWrite('CreateCommitOnBranch');
        const { branch, expectedHeadOid, fileChanges, message } = input;
        const name = branch.branchName;
        if (branch.repositoryNameWithOwner !== `${REPO.owner}/${REPO.name}` || !refs.has(name)) {
          throw refusal(`Could not resolve to a Ref with the name ${name}.`, 'NOT_FOUND');
        }
        const head = refs.get(name)!;
        if (head !== expectedHeadOid) throw refusal(`Expected branch to point to "${expectedHeadOid}" but it did not. Pull and try again.`, 'STALE_DATA');
        const changed: Record<string, Uint8Array | null> = {};
        for (const { path } of fileChanges?.deletions ?? []) {
          if (!commits.get(head)!.files.has(path)) throw refusal(`A path was requested for deletion which does not exist: ${path}`, 'UNPROCESSABLE');
          changed[path] = null;
        }
        for (const { path, contents } of fileChanges?.additions ?? []) changed[path] = Uint8Array.from(Buffer.from(contents, 'base64'));
        const oid = addCommit(head, changed, message.body ? `${message.headline}\n\n${message.body}` : message.headline);
        refs.set(name, oid);
        return { __typename: 'CreateCommitOnBranchPayload', commit: commitObject(commits.get(oid)!) };
      },
      markPullRequestReadyForReview: (_, { input }) => {
        requireWrite('MarkPullRequestReadyForReview');
        const pull = pulls.find((item) => item.id === input.pullRequestId);
        if (!pull) throw refusal('Could not resolve to a node.', 'NOT_FOUND');
        pull.draft = false;
        return { __typename: 'MarkPullRequestReadyForReviewPayload', pullRequest: pullObject(pull) };
      },
    },
    CreateRefPayload: { ref: ({ ref }) => ref },
    CreateCommitOnBranchPayload: { commit: ({ commit }) => commit },
    MarkPullRequestReadyForReviewPayload: { pullRequest: ({ pullRequest }) => pullRequest },
  };

  function requireWrite(mutation: string) {
    if (!canPush()) throw refusal(`${login} does not have the correct permissions to execute \`${mutation}\``, 'FORBIDDEN');
  }

  function graphql(body: string): FakeResponse {
    const { query, variables = {} } = JSON.parse(body) as { query: string; variables?: Record<string, Value> };
    try {
      const { kind, selection } = parseOperation(query, variables);
      if (kind === 'query') return json(200, { data: run(selection, { __typename: 'Query' }, types) });

      // Each top-level mutation reports its own failure, beside the others' data.
      const data: Record<string, unknown> = {};
      const errors: unknown[] = [];
      for (const node of selection as FieldNode[]) {
        try {
          Object.assign(data, run([node], { __typename: 'Mutation' }, types));
        } catch (error) {
          if (!(isRefusal(error)) || error.type === 'undefinedField') throw error;
          data[node.alias] = null;
          errors.push({ type: error.type, path: [node.alias], message: error.message });
        }
      }
      return json(200, errors.length ? { data, errors } : { data });
    } catch (error) {
      if (!(isRefusal(error))) throw error;
      return json(200, { errors: [{ message: error.message, extensions: { code: error.type } }] });
    }
  }

  function createPull(body: { title: string; body?: string; head: string; base: string; draft?: boolean }): FakeResponse {
    const invalid = (message: string) => json(422, { message: 'Validation Failed', errors: [{ resource: 'PullRequest', code: 'custom', message }] });
    if (!canPush()) return json(403, { message: 'Must have push access to this repository.' });
    if (!refs.has(body.head)) return invalid(`head ${body.head} does not exist`);
    if (pulls.some((pull) => pull.head === body.head && pull.state === 'OPEN' && !pull.crossRepository)) {
      return invalid(`A pull request already exists for ${REPO.owner}:${body.head}.`);
    }
    const pull: Pull = {
      number: pulls.length + 1,
      id: `PR_fake${pulls.length + 1}`,
      title: body.title,
      body: body.body ?? '',
      head: body.head,
      base: body.base,
      draft: body.draft ?? false,
      state: 'OPEN',
      crossRepository: false,
    };
    if (!pullCommits(pull).length) return invalid(`No commits between ${body.base} and ${body.head}`);
    pulls.push(pull);
    return json(201, {
      number: pull.number,
      node_id: pull.id,
      html_url: `https://github.com/${REPO.owner}/${REPO.name}/pull/${pull.number}`,
      title: pull.title,
      draft: pull.draft,
      state: 'open',
      head: { ref: pull.head, sha: headOf(pull) },
      base: { ref: pull.base },
    });
  }

  function mergePull(pull: Pull, body: { merge_method?: string; sha?: string; commit_title?: string; commit_message?: string }): FakeResponse {
    if (!canPush()) return json(403, { message: 'Must have push access to this repository.' });
    if (pull.state === 'MERGED') return json(405, { message: 'Pull Request is not mergeable' });
    if (pull.state === 'CLOSED') return json(405, { message: 'Pull Request is not mergeable' });
    if (body.sha && body.sha !== headOf(pull)) return json(409, { message: 'Head branch was modified. Review and try the merge again.' });
    if (forcedMergeState?.times) {
      forcedMergeState.times -= 1;
      return json(405, { message: 'Base branch was modified. Review and try the merge again.' });
    }
    if (pull.draft) return json(405, { message: 'Pull Request is still a work in progress' });
    if (conflicts(pull).length) return json(405, { message: 'Pull Request is not mergeable' });

    const fork = forkPoint(pull)!;
    const head = commits.get(headOf(pull)!)!;
    const changed: Record<string, Uint8Array | null> = {};
    for (const path of changedPaths(fork, head)) {
      const oid = head.files.get(path);
      changed[path] = oid ? blobs.get(oid)! : null;
    }
    // Squashing lists the commits unless told what to write instead.
    const list = pullCommits(pull).map(({ message }) => `* ${message}`).join('\n\n');
    const message = `${body.commit_title ?? pull.title}\n\n${body.commit_message ?? list}`;
    const oid = addCommit(refs.get(pull.base)!, changed, message);
    refs.set(pull.base, oid);
    pull.state = 'MERGED';
    pull.mergeOid = oid;
    if (deleteBranchOnMerge) refs.delete(pull.head);
    return json(200, { sha: oid, merged: true, message: 'Pull Request successfully merged' });
  }

  function rest(request: FakeRequest, url: URL): FakeResponse {
    const { method } = request;
    const path = decodeURIComponent(url.pathname);
    const body = request.body ? JSON.parse(request.body) : {};

    if (method === 'GET' && path === '/user') {
      return json(200, { id: 7, login, name: 'Patricia', email: 'patricia@example.com', avatar_url: 'https://example.com/a.png', html_url: `https://github.com/${login}` });
    }
    if (!path.startsWith(`${REPO_PATH}/`)) return notFound();
    const route = path.slice(REPO_PATH.length + 1);

    let match = /^commits\/([^/]+)\/check-runs$/.exec(route);
    if (match && method === 'GET') {
      const runs = checks.get(match[1]) ?? [];
      return json(200, { total_count: runs.length, check_runs: runs });
    }

    if (route === 'pulls' && method === 'POST') return createPull(body);

    match = /^pulls\/(\d+)(\/merge)?$/.exec(route);
    if (match) {
      const pull = pulls.find((item) => item.number === Number(match![1]));
      if (!pull) return notFound();
      if (match[2] && method === 'PUT') return mergePull(pull, body);
      if (!match[2] && method === 'PATCH') {
        if (!canPush()) return json(403, { message: 'Must have push access to this repository.' });
        if (pull.state === 'MERGED') return json(422, { message: 'Validation Failed', errors: [{ code: 'custom', message: 'state cannot be changed. The pull request was merged.' }] });
        if (body.state === 'closed') pull.state = 'CLOSED';
        return json(200, { number: pull.number, state: pull.state.toLowerCase() });
      }
    }

    match = /^git\/refs\/heads\/(.+)$/.exec(route);
    if (match && method === 'DELETE') {
      if (!canPush()) return json(403, { message: 'Must have push access to this repository.' });
      if (!refs.has(match[1])) return json(422, { message: 'Reference does not exist' });
      deleteRef(match[1]);
      return empty(204);
    }

    match = /^git\/blobs\/([0-9a-f]+)$/.exec(route);
    if (match && method === 'GET') {
      const bytes = blobs.get(match[1]);
      if (!bytes) return notFound();
      return { status: 200, headers: { ...CORS, 'content-type': 'application/octet-stream' }, body: bytes };
    }

    match = /^contents\/(.+)$/.exec(route);
    if (match && method === 'GET') {
      const oid = resolveRev(url.searchParams.get('ref') ?? REPO.main)?.files.get(match[1]);
      if (!oid) return notFound();
      return { status: 200, headers: { ...CORS, 'content-type': 'application/vnd.github.raw+json; charset=utf-8' }, body: blobs.get(oid)! };
    }

    return notFound();
  }

  function handle(input: FakeRequest): FakeResponse {
    const request = { ...input, headers: Object.fromEntries(Object.entries(input.headers).map(([key, value]) => [key.toLowerCase(), value])) };
    requests.push(request);
    const url = new URL(request.url);
    if (url.origin !== API) return { status: 0, headers: {}, body: '' };
    if (request.method === 'OPTIONS') return empty(204);

    const failure = failures.findIndex(({ match }) => match(request));
    if (failure >= 0) return failures.splice(failure, 1)[0].response;

    const token = /^(?:token|bearer) (.+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (token !== FAKE_TOKEN) return json(401, { message: 'Bad credentials' });

    if (url.pathname === '/graphql' && request.method === 'POST') return graphql(request.body ?? '{}');
    return rest(request, url);
  }

  async function fakeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = input instanceof Request ? input.url : String(input);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const response = handle({ method: init.method ?? 'GET', url, headers, body: typeof init.body === 'string' ? init.body : null });
    if (response.status === 0) throw new TypeError('Failed to fetch');
    const nothing = response.status === 204 || response.body === '';
    return new Response(nothing ? null : (response.body as BodyInit), { status: response.status, headers: response.headers });
  }

  refs.set(REPO.main, addCommit(null, files, 'Start'));

  return {
    /** For anything that can pass a request along, like a Playwright route. */
    handle,
    /** A drop-in `fetch`. */
    fetch: fakeFetch as typeof fetch,
    /** Every request made, in order. */
    requests,

    head: (branch: string) => refs.get(branch),
    /** What a file holds at a branch or commit. */
    read: (rev: string, path: string) => {
      const oid = resolveRev(rev)?.files.get(path);
      return oid === undefined ? undefined : new TextDecoder().decode(blobs.get(oid));
    },
    /** A branch's commits, oldest first, with the files each one changed. */
    log: (branch: string) =>
      history(refs.get(branch) ?? '').map((commit) => ({
        oid: commit.oid,
        message: commit.message,
        changed: commit.parents.length ? changedPaths(commits.get(commit.parents[0])!, commit) : [...commit.files.keys()],
      })),
    pulls: () => pulls.map((pull) => ({ ...pull })),

    /** Someone else pushes. `null` removes a file. Makes the branch from main if it isn't there. */
    push(branch: string, changed: Record<string, string | Uint8Array | null>, message = 'Someone else'): string {
      const oid = addCommit(refs.get(branch) ?? refs.get(REPO.main)!, changed, message);
      refs.set(branch, oid);
      return oid;
    },
    /** A pull request from someone's fork, whose head branch can have any name. */
    openForkPull(head: string) {
      pulls.push({
        number: pulls.length + 1,
        id: `PR_fake${pulls.length + 1}`,
        title: 'From a fork',
        body: '',
        head,
        base: REPO.main,
        draft: false,
        state: 'OPEN',
        crossRepository: true,
      });
    },
    /** The account's access changes, as when a collaborator is removed. */
    setPermission(next: NonNullable<FakeOptions['permission']>) {
      permission = next;
    },
    closePull(number: number) {
      pulls.find((pull) => pull.number === number)!.state = 'CLOSED';
    },
    setCheck,
    /** The next request that matches gets this answer. Status 0 fails the connection. */
    failNext(match: (request: FakeRequest) => boolean, status: number, value: unknown = { message: 'Nope' }, headers: Record<string, string> = {}) {
      failures.push({ match, response: status ? json(status, value, headers) : { status: 0, headers: {}, body: '' } });
    },
    /** The next `times` merges are refused, and GitHub reports this mergeStateStatus. */
    blockMerge(state: string, times = 1) {
      forcedMergeState = { state, times };
    },
  };
}

/** What Sveltia stores after a sign-in, for `localStorage` in a spec. */
export const fakeAccount = (login = 'patricia') => JSON.stringify({ backendName: 'github', login, token: FAKE_TOKEN });

/** Sends the page's calls to GitHub to the fake. */
export async function routeFakeGithub(page: Page, fake: FakeGithub): Promise<void> {
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const { status, headers, body } = fake.handle({
      method: request.method(),
      url: request.url(),
      headers: await request.allHeaders(),
      body: request.postData(),
    });
    if (status === 0) await route.abort('failed');
    else await route.fulfill({ status, headers, body: typeof body === 'string' ? body : Buffer.from(body) });
  });
}
