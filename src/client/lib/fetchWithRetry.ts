export interface FetchRetryOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  backoffFactor?: number;
}

/**
 * Robust fetch wrapper with automatic exponential backoff retries.
 * Especially useful for mobile devices waking from background or resuming Tailscale tunnels.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: FetchRetryOptions
): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 400,
    backoffFactor = 2,
    ...fetchOptions
  } = init || {};

  let attempt = 0;
  let delay = retryDelay;

  while (true) {
    try {
      const response = await fetch(input, fetchOptions);

      // Retry on temporary server gateway/unavailability statuses during tunnel reconnections
      if (
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        attempt < retries
      ) {
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= backoffFactor;
        continue;
      }

      return response;
    } catch (err: any) {
      attempt++;
      if (attempt <= retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= backoffFactor;
        continue;
      }

      const msg = err?.message || String(err);
      const isNetworkFail =
        err?.name === 'TypeError' ||
        msg.toLowerCase().includes('failed to fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('load failed');

      if (isNetworkFail) {
        throw new Error('Connection interrupted. Tailscale or network is reconnecting, please try again.');
      }

      throw err;
    }
  }
}
