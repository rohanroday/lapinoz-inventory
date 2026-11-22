import { handle, requireApiUser } from "@/lib/auth";
import { getDayReport } from "@/lib/stock";

export const GET = handle(async (req) => {
  await requireApiUser("owner");
  return getDayReport(new URL(req.url).searchParams.get("date"));
});
