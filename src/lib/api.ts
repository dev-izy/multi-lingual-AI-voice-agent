import { auth } from './firebase';

const BASE = import.meta.env.VITE_API_BASE as string | undefined;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * POSTs JSON to the Worker with the current user's Firebase ID token.
 *
 * `getIdToken()` returns a cached token and refreshes it automatically when
 * it is close to expiry, so this is cheap to call on every request.
 */
/** Long enough for a slow Gemini reply on a weak connection, short enough to not feel broken. */
const DEFAULT_TIMEOUT_MS = 45_000;

export async function callApi<TRequest, TResponse>(
  path: string,
  body: TRequest,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<TResponse> {
  if (!BASE) {
    throw new ApiError(0, 'VITE_API_BASE is not set. See SETUP.md step 6.');
  }

  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'Sign in first.');

  const token = await user.getIdToken();

  // One controller that fires on either the caller's cancel or our timeout,
  // so a hung request always ends in an error instead of a spinner forever.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = (): void => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    if (timedOut) {
      throw new ApiError(408, 'The server took too long to reply. Try again.');
    }
    if (signal?.aborted) {
      throw new ApiError(499, 'Request cancelled.');
    }
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, detail?.error ?? `Request failed (${response.status}).`);
  }

  return (await response.json()) as TResponse;
}