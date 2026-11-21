import { handle, HttpError, readBody, requireApiUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { UOMS } from "@/lib/qty";
import { listItems } from "@/lib/stock";

export const GET = handle(async () => {
  await requireApiUser();
  return { items: await listItems() };
});

export const POST = handle(async (req) => {
  await requireApiUser("owner");
  const body = await readBody(req);
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  // Uppercase keeps "sauces" and "SAUCES" as one category.
  const category = String(body.category ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 60);
  const uom = String(body.uom ?? "");
  if (name.length < 2 || category.length < 2 || !UOMS.includes(uom)) throw new HttpError(400, "Fill item name, category and unit");

  const db = await getDb();
  const items = db.collection("items");
  const nameKey = name.toLowerCase();
  const existing = await items.findOne({ nameKey });
  if (existing && !existing.deletedAt) throw new HttpError(409, "This item already exists");
  if (existing) {
    await items.updateOne(
      { _id: existing._id },
      { $set: { name, category, uom, stockMilli: null, minMilli: null }, $unset: { deletedAt: "", deletedBy: "" } },
    );
    return { ok: true };
  }

  const last = await items.find().sort({ order: -1 }).limit(1).next();
  try {
    await items.insertOne({ name, nameKey, category, uom, order: (last?.order ?? 0) + 1, orderedQty: null, stockMilli: null, minMilli: null });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new HttpError(409, "This item already exists");
    throw error;
  }
  return { ok: true };
});
