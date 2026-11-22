import { handle, readBody, requireApiUser } from "@/lib/auth";
import { closeRequest } from "@/lib/requests";

export const PATCH = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser("owner");
  const { id } = await ctx.params;
  const body = await readBody(req);
  return closeRequest(id, body.status, user);
});
