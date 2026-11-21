import { handle, readBody, requireApiUser } from "@/lib/auth";
import { updateMin } from "@/lib/stock";

export const PATCH = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser("owner");
  const { id } = await ctx.params;
  const body = await readBody(req);
  return updateMin(id, body.min, user);
});
