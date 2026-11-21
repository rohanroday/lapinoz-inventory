import { handle, readBody, requireApiUser } from "@/lib/auth";
import { recordMovement } from "@/lib/stock";

export const POST = handle(async (req) => {
  const user = await requireApiUser();
  const body = await readBody(req);
  return recordMovement(
    {
      itemId: body.itemId,
      type: body.type,
      qty: body.qty,
      personName: body.personName,
      note: body.note,
      requestId: body.requestId,
    },
    user,
  );
});
