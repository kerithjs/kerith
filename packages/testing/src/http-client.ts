/**
 * http-client.ts — Thin fetch wrapper for E2E tests.
 *
 * Responsibilities (only these):
 *  - Build a base URL from a port number.
 *  - Provide typed shorthand methods (get, post, put, patch, del).
 *  - Forward raw Response objects so callers can assert status + body freely.
 */

import type { HttpClient, HttpMethod, RequestOpts } from './types.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an {@link HttpClient} pre-configured for `http://localhost:<port>`.
 *
 * @param port - The TCP port returned by `runFixture`.
 */
export function createHttpClient(port: number): HttpClient {
  const base = `http://localhost:${port}`;

  async function request(path: string, opts: RequestOpts = {}): Promise<Response> {
    const { method = 'GET', body, headers = {} } = opts;

    const init: RequestInit = { method, headers: { ...headers } };

    if (body !== undefined) {
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    return fetch(`${base}${path}`, init);
  }

  return {
    request,

    get(path, headers?) {
      return request(path, { method: 'GET', headers });
    },

    post(path, body?, headers?) {
      return request(path, { method: 'POST', body, headers });
    },

    put(path, body?, headers?) {
      return request(path, { method: 'PUT', body, headers });
    },

    patch(path, body?, headers?) {
      return request(path, { method: 'PATCH', body, headers });
    },

    del(path, headers?) {
      return request(path, { method: 'DELETE', headers });
    },
  };
}
