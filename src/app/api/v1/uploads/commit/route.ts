import { api, parseJson } from "@/server/http";
import { commitUploads, commitUploadsSchema } from "@/server/services/uploads";

/** Attaches received files to their targets: { uploadIds: [...] }. One result per upload. */
export const POST = api("write", async ({ req }) => {
  const { uploadIds } = await parseJson(req, commitUploadsSchema);
  return commitUploads(uploadIds);
});
