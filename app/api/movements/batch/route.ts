import { handle, readBody, requireApiUser } from "@/lib/auth";
import { saveBatch } from "@/lib/stock";

export const POST = handle(async (req) => {
  const user = await requireApiUser();
  return saveBatch(await readBody(req), user);
});
