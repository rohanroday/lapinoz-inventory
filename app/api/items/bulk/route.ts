import { handle, HttpError, readBody, requireApiUser } from "@/lib/auth";
import { deleteItems, restoreItems } from "@/lib/stock";

export const POST = handle(async (req) => {
  const user = await requireApiUser("owner");
  const body = await readBody(req);
  if (body.action === "delete") return deleteItems(body.ids, user);
  if (body.action === "restore") return restoreItems(body.ids, user);
  throw new HttpError(400, "Unknown action");
});
