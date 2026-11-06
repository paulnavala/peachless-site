import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ROOT, canSignIn, readToken, signIn, USER_STORAGE_KEY, type SignInWindow } from '../../src/builder/persist/auth';
import { BackendError } from '../../src/builder/persist/types';
import { createFakeGithub, FAKE_TOKEN } from '../e2e/fake-github';

/**
 * One sign-in serves the builder and /admin/, so the shape in storage and the
 * handshake with the Worker have to be Sveltia's own. Both are from its source:
 * services/user/constants.js and services/backends/git/shared/auth.js.
 */
const WORKER = 'https://auth.peachless.design';

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    store,
  };
}

/** A window and the Worker's popup, to play the handshake out by hand. */
function fakeWindow(hostname = 'peachless.design') {
  const target = new EventTarget();
  const popup = {
    closed: false,
    sent: [] as { message: unknown; origin: string }[],
    postMessage(message: unknown, origin: string) {
      this.sent.push({ message, origin });
    },
    close() {
      this.closed = true;
    },
  };
  const open = vi.fn<(url: string, name: string, features: string) => typeof popup | null>(() => popup);
  const win = {
    location: { hostname },
    screen: { availWidth: 1600, availHeight: 1000 },
    open,
    addEventListener: target.addEventListener.bind(target),
  } as unknown as SignInWindow;
  const send = (data: unknown, from: { origin?: string; source?: unknown } = {}) =>
    target.dispatchEvent(Object.assign(new Event('message'), { data, origin: from.origin ?? WORKER, source: 'source' in from ? from.source : popup }));
  return { win, popup, open, send };
}

const success = (token = FAKE_TOKEN) => `authorization:github:success:${JSON.stringify({ provider: 'github', token })}`;

const flush = () => new Promise((done) => setTimeout(done));

describe('readToken', () => {
  const stored = (value: unknown) => memoryStorage({ [USER_STORAGE_KEY]: typeof value === 'string' ? value : JSON.stringify(value) });

  it('reads Sveltia’s key', () => {
    expect(USER_STORAGE_KEY).toBe('sveltia-cms.user');
  });

  it('finds the token in a full account', () => {
    expect(readToken(stored({ backendName: 'github', id: 1, login: 'patricia', token: 'abc' }))).toBe('abc');
  });

  it('finds it in an account with just a token', () => {
    expect(readToken(stored({ token: 'abc' }))).toBe('abc');
  });

  it('has nothing before anyone signs in', () => {
    expect(readToken(memoryStorage())).toBeNull();
  });

  it('has nothing after a sign-out, which leaves an empty account', () => {
    expect(readToken(stored({}))).toBeNull();
  });

  it('has nothing for a sign-in that never finished', () => {
    expect(readToken(stored({ backendName: 'github' }))).toBeNull();
  });

  it('ignores Sveltia’s local folder sign-in', () => {
    expect(readToken(stored({ backendName: 'local', token: 'abc' }))).toBeNull();
  });

  it.each([['not json'], ['null'], ['"a string"'], ['7'], [{ token: 7 }], [{ token: '' }]])('ignores %j', (value) => {
    expect(readToken(stored(value))).toBeNull();
  });

  it('copes with a browser that refuses to hand storage over at all', () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('The operation is insecure');
      },
    });
    expect(readToken()).toBeNull();
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('reads the browser’s own storage when it isn’t given any', () => {
    vi.stubGlobal('localStorage', stored({ token: 'abc' }));
    expect(readToken()).toBe('abc');
    vi.unstubAllGlobals();
  });

  it('copes with storage the browser refuses', () => {
    const blocked = {
      getItem() {
        throw new Error('The operation is insecure');
      },
    };
    expect(readToken(blocked)).toBeNull();
  });
});

describe('canSignIn', () => {
  it('is only the real site, because the Worker turns everything else away', () => {
    expect(canSignIn('peachless.design')).toBe(true);
    for (const host of ['localhost', 'builder-draft.peachless.pages.dev', 'peachless.pages.dev', 'www.peachless.design', 'peachless.design.evil.example']) {
      expect(canSignIn(host)).toBe(false);
    }
  });
});

describe('signIn', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const start = (hostname?: string) => {
    const fake = createFakeGithub({ files: { 'README.md': 'Hello' } });
    const storage = memoryStorage();
    const window = fakeWindow(hostname);
    const result = signIn({ win: window.win, fetch: fake.fetch, storage });
    result.catch(() => undefined);
    return { ...window, fake, storage, result };
  };

  it('opens the Worker with Sveltia’s request', async () => {
    const { open, popup, send, result } = start();
    const [url, name, features] = open.mock.calls[0];
    const opened = new URL(url);
    expect(opened.origin + opened.pathname).toBe(`${WORKER}/auth`);
    expect(Object.fromEntries(opened.searchParams)).toEqual({ provider: 'github', site_id: 'peachless.design', scope: 'public_repo,user' });
    expect(name).toBe('auth');
    expect(features).toBe('width=600,height=800,top=100,left=500');
    send('authorizing:github');
    expect(popup.sent).toEqual([{ message: 'authorizing:github', origin: WORKER }]);
    send(success());
    await result;
  });

  it('opens the window before anything asynchronous, or the browser blocks it', () => {
    const { open } = start();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('answers the handshake, then takes the token and closes the window', async () => {
    const { popup, send, result } = start();
    send('authorizing:github');
    send(success());
    await expect(result).resolves.toBe(FAKE_TOKEN);
    expect(popup.closed).toBe(true);
  });

  it('stores the account as Sveltia would, so /admin/ is signed in too', async () => {
    const { send, storage, result } = start();
    send('authorizing:github');
    send(success());
    await result;
    const account = JSON.parse(storage.store.get(USER_STORAGE_KEY)!);
    expect(account).toEqual({
      backendName: 'github',
      id: 7,
      name: 'Patricia',
      login: 'patricia',
      email: 'patricia@example.com',
      avatarURL: 'https://example.com/a.png',
      profileURL: 'https://github.com/patricia',
      bot: false,
      token: FAKE_TOKEN,
    });
    // Without a string backendName, Sveltia's getUserCache ignores the account.
    expect(typeof account.backendName).toBe('string');
    expect(readToken(storage)).toBe(FAKE_TOKEN);
  });

  describe('the token', () => {
    it('only ever goes to GitHub’s API', async () => {
      const { fake, open, popup, send, result } = start();
      send('authorizing:github');
      send(success());
      await result;

      expect(fake.requests.map(({ url }) => url)).toEqual([`${API_ROOT}/user`]);
      expect(fake.requests[0].headers.authorization).toBe(`token ${FAKE_TOKEN}`);
      expect(API_ROOT).toBe('https://api.github.com');
      expect(open.mock.calls.flat().join(' ')).not.toContain(FAKE_TOKEN);
      expect(JSON.stringify(popup.sent)).not.toContain(FAKE_TOKEN);
    });

    it('is never written to the console', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method));
      const { send, result } = start();
      send('authorizing:github');
      send(success());
      await result;
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(FAKE_TOKEN);
        spy.mockRestore();
      }
    });

    it('can’t follow a redirect', async () => {
      const send = vi.fn<typeof fetch>(async () => new Response('{}'));
      const window = fakeWindow();
      const result = signIn({ win: window.win, fetch: send, storage: memoryStorage() });
      window.send('authorizing:github');
      window.send(success());
      await result;
      expect(send.mock.calls[0][1]?.redirect).toBe('error');
    });
  });

  describe('who it listens to', () => {
    it('ignores a message from another window', async () => {
      const { popup, send, result } = start();
      send('authorizing:github', { source: {} });
      send(success('stolen'), { source: {} });
      send(success('stolen'), { source: null });
      expect(popup.sent).toEqual([]);
      expect(popup.closed).toBe(false);
      send(success());
      await expect(result).resolves.toBe(FAKE_TOKEN);
    });

    it('ignores a message from another origin, even from the popup', async () => {
      const { popup, send, result } = start();
      send('authorizing:github', { origin: 'https://evil.example' });
      send(success('stolen'), { origin: 'https://evil.example' });
      send(success('stolen'), { origin: 'https://peachless.design' });
      expect(popup.sent).toEqual([]);
      send(success());
      await expect(result).resolves.toBe(FAKE_TOKEN);
    });

    it('ignores anything that isn’t text', async () => {
      const { send, result } = start();
      send({ token: 'stolen' });
      send(null);
      send(success());
      await expect(result).resolves.toBe(FAKE_TOKEN);
    });

    it('stops listening when it’s done', async () => {
      const { fake, popup, send, result } = start();
      send(success());
      await result;
      send('authorizing:github');
      send(success('late'));
      await flush();
      expect(popup.sent).toEqual([]);
      expect(fake.requests).toHaveLength(1);
    });
  });

  describe('when it doesn’t work out', () => {
    const refusal = (kind: string, message: string) => expect.objectContaining({ name: 'BackendError', kind, message });

    it('won’t open the window where the Worker would refuse', async () => {
      const { open, result } = start('builder-draft.peachless.pages.dev');
      await expect(result).rejects.toEqual(refusal('auth', 'Signing in only works on peachless.design. Here, sign in at /admin/ with a token first.'));
      expect(open).not.toHaveBeenCalled();
    });

    it('says so when the browser blocks the window', async () => {
      const window = fakeWindow();
      window.open.mockReturnValue(null);
      await expect(signIn({ win: window.win, fetch: vi.fn(), storage: memoryStorage() })).rejects.toEqual(
        refusal('auth', 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.')
      );
    });

    it('notices the window being closed', async () => {
      const { popup, result } = start();
      popup.closed = true;
      vi.advanceTimersByTime(1000);
      await expect(result).rejects.toEqual(refusal('auth', 'The sign-in window closed before it finished. Try again when you’re ready.'));
    });

    it('stops watching once it’s finished', async () => {
      const { popup, send, result } = start();
      send(success());
      await result;
      popup.closed = false;
      expect(vi.getTimerCount()).toBe(0);
    });

    it('passes on a refusal from the Worker, keeping the raw words as details', async () => {
      const { popup, send, result } = start();
      send('authorizing:github');
      send(`authorization:github:error:${JSON.stringify({ provider: 'github', error: 'Your domain is not allowed', errorCode: 'UNSUPPORTED_DOMAIN' })}`);
      await expect(result).rejects.toEqual(refusal('auth', 'GitHub didn’t sign you in. Try again.'));
      await expect(result).rejects.toHaveProperty('details', 'Your domain is not allowed');
      expect(popup.closed).toBe(true);
    });

    it('treats a garbled answer as a refusal', async () => {
      const { send, result } = start();
      send('authorization:github:success:{not json');
      await expect(result).rejects.toEqual(refusal('auth', 'GitHub didn’t sign you in. Try again.'));
    });

    it('treats an answer with no token as a refusal', async () => {
      const { send, result } = start();
      send('authorization:github:success:{}');
      await expect(result).rejects.toBeInstanceOf(BackendError);
    });

    it('stores nothing when GitHub turns the token down', async () => {
      const { send, storage, result } = start();
      send(success('not-a-real-token'));
      await expect(result).rejects.toEqual(refusal('auth', 'GitHub didn’t sign you in. Try again.'));
      expect(storage.store.size).toBe(0);
    });

    it('says so when GitHub can’t be reached', async () => {
      const window = fakeWindow();
      const result = signIn({ win: window.win, fetch: () => Promise.reject(new TypeError('Failed to fetch')), storage: memoryStorage() });
      result.catch(() => undefined);
      window.send(success());
      await expect(result).rejects.toEqual(refusal('network', 'Couldn’t reach GitHub. Check your connection and try again.'));
    });

    it('never mentions the token in what it reports', async () => {
      const { send, result } = start();
      send(success('not-a-real-token'));
      const error = (await result.catch((caught) => caught)) as BackendError;
      expect(`${error.message} ${error.details}`).not.toContain('not-a-real-token');
    });
  });
});
