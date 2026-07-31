/**
 * Response helpers for the /api/* routes.
 *
 * The implementation lives in `lib/apiResponse.ts` so the Cloudflare
 * Pages Functions under /functions can share it too; this module is
 * kept as the import path the route handlers already use.
 */

export {
  badRequest,
  jsonError,
  jsonOk,
  notFound,
  type ApiErrorBody,
} from "@/lib/apiResponse";
