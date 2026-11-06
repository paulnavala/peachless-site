/**
 * One sign-in for both tools: the builder reads and writes the account Sveltia
 * keeps, so signing in at /admin/ signs in here, and the other way round.
 *
 * The handshake is Sveltia's own (`authorize` in backends/git/shared/auth.js). The
 * token comes from the sign-in Worker and is only ever sent to GitHub's API.
 */
import { BackendError } from './types';

export const API_ROOT = 'https://api.github.com';

/** Words more than one module says. */
export const MESSAGES = {
  auth: 'You’ve been signed out. Sign in again to keep working.',
  network: 'Couldn’t reach GitHub. Check your connection and try again.',
  moved: 'This draft changed somewhere else, such as another tab. Reload to pick up the latest.',
} as const;

/** Sveltia's key. Its value is the account as JSON, with `token` inside. */
export const USER_STORAGE_KEY = 'sveltia-cms.user';

/** `backend.base_url` and Sveltia's default `auth_endpoint`, from public/admin/config.yml. */
const AUTH_URL = 'https://auth.peachless.design/auth';

/** `backend.auth_scope`, plus the `user` Sveltia always asks for. */
const AUTH_SCOPE = 'public_repo,user';

/** The Worker's ALLOWED_DOMAINS. Anywhere else it refuses, so don't open the window. */
const SIGN_IN_HOST = 'peachless.design';

const POPUP = { width: 600, height: 800 };

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

/** The parts of `window` a sign-in needs. */
export type SignInWindow = Pick<Window, 'open' | 'addEventListener'> & {
  location: Pick<Location, 'hostname'>;
  screen: Pick<Screen, 'availWidth' | 'availHeight'>;
};

export interface SignInOptions {
  win?: SignInWindow;
  fetch?: typeof fetch;
  storage?: Writer;
}

/** The token from the shared account, if there is one. Works on any host. */
export function readToken(storage?: Reader): string | null {
  try {
    const user: unknown = JSON.parse((storage ?? localStorage).getItem(USER_STORAGE_KEY) ?? 'null');
    if (typeof user !== 'object' || user === null) return null;
    const { token, backendName = 'github' } = user as { token?: unknown; backendName?: unknown };
    return typeof token === 'string' && token && backendName === 'github' ? token : null;
  } catch {
    return null;
  }
}

/** Sign-in only works on the real site. Elsewhere, sign in at /admin/ with a token. */
export const canSignIn = (hostname: string = location.hostname): boolean => hostname === SIGN_IN_HOST;

function popupFeatures({ screen }: SignInWindow): string {
  const left = screen.availWidth / 2 - POPUP.width / 2;
  const top = screen.availHeight / 2 - POPUP.height / 2;
  return `width=${POPUP.width},height=${POPUP.height},top=${top},left=${left}`;
}

function handshake(win: SignInWindow, popup: WindowProxy): Promise<string> {
  const origin = new URL(AUTH_URL).origin;
  return new Promise((resolve, reject) => {
    const listening = new AbortController();
    const closed = setInterval(() => {
      if (!popup.closed) return;
      finish();
      reject(new BackendError('auth', 'The sign-in window closed before it finished. Try again when you’re ready.'));
    }, 1000);

    function finish() {
      listening.abort();
      clearInterval(closed);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== popup || event.origin !== origin || typeof event.data !== 'string') return;
      if (event.data === 'authorizing:github') {
        popup.postMessage(event.data, origin);
        return;
      }
      finish();
      popup.close();
      const payload = /^authorization:github:(?:success|error):(.+)/s.exec(event.data)?.[1];
      let result: { token?: unknown; error?: unknown } = {};
      try {
        result = JSON.parse(payload ?? '{}');
      } catch {
        // Falls through as a refusal below.
      }
      if (typeof result?.token === 'string' && result.token) resolve(result.token);
      else reject(new BackendError('auth', 'GitHub didn’t sign you in. Try again.', String(result?.error ?? event.data)));
    }

    win.addEventListener('message', onMessage as EventListener, { signal: listening.signal });
  });
}

/** Writes the account as Sveltia would, or /admin/ wouldn't recognise it. */
async function remember(token: string, send: typeof fetch, storage: Writer): Promise<void> {
  let response: Response;
  try {
    response = await send(`${API_ROOT}/user`, {
      cache: 'no-cache',
      redirect: 'error',
      headers: { Authorization: `token ${token}`, Accept: 'application/json' },
    });
  } catch (error) {
    throw new BackendError('network', MESSAGES.network, String(error));
  }
  if (!response.ok) throw new BackendError('auth', 'GitHub didn’t sign you in. Try again.', `GET /user: ${response.status}`);
  const user = (await response.json()) as Record<string, unknown>;
  const account = {
    backendName: 'github',
    id: user.id,
    name: user.name,
    login: user.login,
    email: user.email,
    avatarURL: user.avatar_url,
    profileURL: user.html_url,
    bot: user.bot ?? false,
    token,
  };
  storage.setItem(USER_STORAGE_KEY, JSON.stringify(account));
}

/** Call this straight from a click: browsers block a window opened any later. */
export async function signIn({
  win = window,
  fetch: send = (...args) => globalThis.fetch(...args),
  storage = localStorage,
}: SignInOptions = {}): Promise<string> {
  const { hostname } = win.location;
  if (!canSignIn(hostname)) {
    throw new BackendError('auth', 'Signing in only works on peachless.design. Here, sign in at /admin/ with a token first.', hostname);
  }
  const params = new URLSearchParams({ provider: 'github', site_id: hostname, scope: AUTH_SCOPE });
  const popup = win.open(`${AUTH_URL}?${params}`, 'auth', popupFeatures(win));
  if (!popup) throw new BackendError('auth', 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');

  const token = await handshake(win, popup);
  await remember(token, send, storage);
  return token;
}
