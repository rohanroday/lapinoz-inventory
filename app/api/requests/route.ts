import { handle, readBody, requireApiUser } from "@/lib/auth";
import { createRequest } from "@/lib/requests";

export const POST = handle(async (req) => {
  const user = await requireApiUser();
  return createRequest(await readBody(req), user);
});
