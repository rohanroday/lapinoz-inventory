import { handle, readBody, requireApiUser } from "@/lib/auth";
import { saveOpening } from "@/lib/stock";

export const POST = handle(async (req) => {
  const user = await requireApiUser("owner");
  return saveOpening(await readBody(req), user);
});
