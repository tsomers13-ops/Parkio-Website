/**
 * Response helpers shared by the /api/* routes.
 * Keeps caching headers and error shapes consistent.
 */

export interface ApiErrorBody {
  error: string;
  message: string;
  status: number;
}

export function jsonOk(data: unknown, sMaxAge: number, swr: number): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Edge / CDN cache hint. Browsers won't cache (no max-age).
      "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`,
    },
  });
}

export function jsonError(
  status: number,
  error: string,
  message: string,
): Response {
  const body: ApiErrorBody = { error, message, status };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function notFound(message: string): Response {
  return jsonError(404, "not_found", message);
}

export function badRequest(message: string): Response {
  return jsonError(400, "bad_request", message);
}
