import { handleApiRequest } from "../../../../src/api";
import { requestTime } from "../../../clock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  return handleApiRequest(request, await requestTime());
}

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as DELETE,
  handle as PUT,
  handle as OPTIONS,
};
