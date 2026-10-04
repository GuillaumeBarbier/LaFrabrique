import { errorResponse } from "@/server/http";
import { readUploadBody, receiveUpload } from "@/server/services/uploads";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ uploadId: string }> };

/**
 * The signed upload URL itself: no session, no key — the single-use token in the URL is the
 * authorisation. PUT the raw file (curl -T) or POST it as multipart `file` (curl -F file=@…).
 */
async function receive(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { uploadId } = await ctx.params;
    const token = new URL(req.url).searchParams.get("token");
    return Response.json(await receiveUpload(uploadId, token, () => readUploadBody(req)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

export const PUT = receive;
export const POST = receive;
