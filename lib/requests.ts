import { ObjectId, type Document } from "mongodb";
import { HttpError, type SessionUser } from "./auth";
import { getDb } from "./db";
import { fromMilli, qtyError, toMilli, type StockRequest } from "./qty";
import { ACTIVE, cleanPerson } from "./stock";

const toRequest = (doc: Document): StockRequest => ({
  id: String(doc._id),
  itemId: String(doc.itemId),
  name: doc.itemName,
  category: doc.category,
  uom: doc.uom,
  qty: fromMilli(doc.qtyMilli),
  note: doc.note ?? "",
  person: doc.personName,
  at: doc.createdAt.toISOString(),
});

export async function listOpenRequests() {
  const db = await getDb();
  const docs = await db.collection("requests").find({ status: "open" }).sort({ createdAt: -1 }).toArray();
  return docs.map(toRequest);
}

export async function countOpenRequests() {
  const db = await getDb();
  return db.collection("requests").countDocuments({ status: "open" });
}

export async function createRequest(body: Record<string, any>, user: SessionUser) {
  const personName = cleanPerson(body.personName);
  if (typeof body.itemId !== "string" || !ObjectId.isValid(body.itemId)) throw new HttpError(400, "Unknown item");
  const db = await getDb();
  const itemId = new ObjectId(body.itemId);
  const item = await db.collection("items").findOne({ _id: itemId, ...ACTIVE });
  if (!item) throw new HttpError(404, "Item not found");

  let qtyMilli: number | null = null;
  if (body.qty !== "" && body.qty !== null && body.qty !== undefined) {
    const problem = qtyError(body.qty, item.uom);
    if (problem) throw new HttpError(400, problem);
    qtyMilli = toMilli(body.qty);
    if (qtyMilli === 0) throw new HttpError(400, "Quantity must be more than 0");
  }

  try {
    await db.collection("requests").insertOne({
      itemId,
      itemName: item.name,
      category: item.category,
      uom: item.uom,
      qtyMilli,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 200) : "",
      personName,
      accountEmail: user.email,
      accountRole: user.role,
      status: "open",
      createdAt: new Date(),
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const open = await db.collection("requests").findOne({ itemId, status: "open" });
      throw new HttpError(409, `Already requested by ${open?.personName ?? "someone"}`);
    }
    throw error;
  }
  return { ok: true };
}

export async function closeRequest(id: string, status: unknown, user: SessionUser) {
  if (!ObjectId.isValid(id)) throw new HttpError(400, "Unknown request");
  if (status !== "brought" && status !== "dismissed") throw new HttpError(400, "Unknown action");
  const db = await getDb();
  const res = await db.collection("requests").updateOne(
    { _id: new ObjectId(id), status: "open" },
    { $set: { status, closedAt: new Date(), closedBy: user.name } },
  );
  if (!res.modifiedCount) throw new HttpError(409, "This request was already closed");
  return { ok: true };
}
