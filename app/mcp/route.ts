import { handleMcpRequest } from "../../src/mcp";
import { requestTime } from "../clock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  return handleMcpRequest(request, await requestTime());
}

export { handle as GET, handle as POST, handle as DELETE };
