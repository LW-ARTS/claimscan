/**
 * Wrapper around fetch() that adds the X-Request-Sig header.
 * Only signs when NEXT_PUBLIC_API_SIGN_KEY is configured.
 * Use this for all client-side fetches to /api/* endpoints.
 */
import { signRequest } from './request-signing';

export async function signedFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const path = url.startsWith('/') ? url.split('?')[0] : new URL(url).pathname;

  const sig = await signRequest(path);
  if (sig) {
    const headers = new Headers(init?.headers);
    headers.set('X-Request-Sig', sig);
    return fetch(input, { ...init, headers });
  }

  return fetch(input, init);
}
