import { ObjectId, type Document } from "mongodb";
import nodemailer from "nodemailer";
import { HttpError, type SessionUser } from "./auth";
import { getDb } from "./db";
import { fmt, fromMilli, qtyError, toMilli, type Item } from "./qty";

// Deleted items stay hidden instead of erased, so Undo works and startup seeding cannot bring them back.
export const ACTIVE = { deletedAt: null };

export function toItem(doc: Document): Item {
  const stock = fromMilli(doc.stockMilli);
  const min = fromMilli(doc.minMilli);
  return {
    id: String(doc._id),
    name: doc.name,
    category: doc.category,
    uom: doc.uom,
    orderedQty: doc.orderedQty ?? null,
    stock,
    min,
    low: stock !== null && min !== null && stock <= min,
  };
}

export async function listItems() {
  const db = await getDb();
  const docs = await db.collection("items").find(ACTIVE).sort({ order: 1 }).toArray();
  return docs.map(toItem);
}

export async function lowCount() {
  const db = await getDb();
  const [row] = await db
    .collection("items")
    .aggregate([
      { $match: { ...ACTIVE, stockMilli: { $ne: null }, minMilli: { $ne: null } } },
      { $match: { $expr: { $lte: ["$stockMilli", "$minMilli"] } } },
      { $count: "n" },
    ])
    .toArray();
  return (row?.n as number) ?? 0;
}

export function cleanPerson(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) throw new HttpError(400, "Enter the full name of the person doing this");
  return name;
}

const objectId = (value: unknown) => {
  if (typeof value !== "string" || !ObjectId.isValid(value)) throw new HttpError(400, "Unknown item");
  return new ObjectId(value);
};

const checkQty = (value: unknown, uom: string) => {
  const error = qtyError(value, uom);
  if (error) throw new HttpError(400, error);
  return toMilli(value);
};

const crossedLow = (before: number | null, after: number, min: number | null) =>
  min !== null && after <= min && (before === null || before > min);

type MovementInput = {
  itemId: unknown;
  type: unknown;
  qty: unknown;
  personName: unknown;
  note?: unknown;
  requestId?: unknown;
};

export async function recordMovement(input: MovementInput, user: SessionUser) {
  const db = await getDb();
  const items = db.collection("items");
  const movements = db.collection("movements");
  const type = input.type;
  if (type !== "in" && type !== "out" && type !== "adjust") throw new HttpError(400, "Unknown action");
  if (type === "adjust" && user.role !== "owner") throw new HttpError(403, "Only the owner can correct a count");

  const personName = cleanPerson(input.personName);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  if (type === "adjust" && !note) throw new HttpError(400, "Write the reason for this correction");
  const requestId = typeof input.requestId === "string" ? input.requestId.slice(0, 64) : undefined;

  // A double tap or retry must not move stock twice.
  if (requestId && (await movements.findOne({ requestId }))) return { duplicate: true };

  const _id = objectId(input.itemId);
  const item = await items.findOne({ _id, ...ACTIVE });
  if (!item) throw new HttpError(404, "Item not found");
  if (type === "out" && item.stockMilli === null) throw new HttpError(409, "No stock recorded yet. Use Add first.");

  const qtyMilli = checkQty(input.qty, item.uom);
  if (type !== "adjust" && qtyMilli === 0) throw new HttpError(400, "Quantity must be more than 0");

  let before = 0;
  let after = 0;
  let wasBlank = false;
  if (type === "adjust") {
    before = item.stockMilli ?? 0;
    after = qtyMilli;
    const res = await items.updateOne({ _id, stockMilli: item.stockMilli }, { $set: { stockMilli: after } });
    if (!res.modifiedCount && item.stockMilli !== after) throw new HttpError(409, "Stock just changed. Check it and try again.");
    wasBlank = item.stockMilli === null;
  } else {
    if (type === "in" && item.stockMilli === null) {
      const first = await items.updateOne({ _id, stockMilli: null }, { $set: { stockMilli: qtyMilli } });
      if (first.modifiedCount) {
        wasBlank = true;
        after = qtyMilli;
      }
    }
    if (!wasBlank) {
      const delta = type === "in" ? qtyMilli : -qtyMilli;
      const filter = type === "out" ? { _id, stockMilli: { $gte: qtyMilli } } : { _id, stockMilli: { $ne: null } };
      const previous = await items.findOneAndUpdate(filter, { $inc: { stockMilli: delta } }, { returnDocument: "before" });
      if (!previous) {
        const left = await items.findOne({ _id });
        throw new HttpError(409, `Only ${fmt(fromMilli(left?.stockMilli))} ${item.uom} in stock`);
      }
      before = previous.stockMilli;
      after = before + delta;
    }
  }

  try {
    await movements.insertOne({
      ...(requestId ? { requestId } : {}),
      itemId: _id,
      itemName: item.name,
      category: item.category,
      uom: item.uom,
      type,
      changeMilli: after - before,
      beforeMilli: before,
      afterMilli: after,
      personName,
      note,
      accountEmail: user.email,
      accountRole: user.role,
      at: new Date(),
    });
  } catch (error) {
    // Never leave a stock change without its name-and-time record.
    await items.updateOne({ _id }, wasBlank ? { $set: { stockMilli: null } } : { $inc: { stockMilli: before - after } });
    if ((error as { code?: number }).code === 11000) return { duplicate: true };
    throw error;
  }

  if (crossedLow(before, after, item.minMilli)) {
    await notifyLow([{ name: item.name, uom: item.uom, stock: after, min: item.minMilli }], personName);
  }
  return { stock: fromMilli(after) };
}

export async function saveOpening(body: Record<string, any>, user: SessionUser) {
  const db = await getDb();
  const items = db.collection("items");
  const personName = cleanPerson(body.personName);
  if (!Array.isArray(body.entries) || !body.entries.length || body.entries.length > 500) {
    throw new HttpError(400, "Enter at least one count");
  }

  const ids = body.entries.map((entry: { itemId: unknown }) => objectId(entry.itemId));
  const docs = new Map((await items.find({ _id: { $in: ids }, ...ACTIVE }).toArray()).map((d) => [String(d._id), d]));
  const planned = body.entries.map((entry: Record<string, unknown>) => {
    const doc = docs.get(String(entry.itemId));
    if (!doc) throw new HttpError(404, "Item not found");
    const read = (value: unknown, label: string) => {
      if (value === "" || value === null || value === undefined) return null;
      const error = qtyError(value, doc.uom);
      if (error) throw new HttpError(400, `${doc.name} (${label}): ${error}`);
      return toMilli(value);
    };
    return { doc, stock: read(entry.stock, "stock"), min: read(entry.min, "minimum") };
  });

  let saved = 0;
  let skipped = 0;
  const lowItems: { name: string; uom: string; stock: number; min: number }[] = [];
  const at = new Date();

  for (let i = 0; i < planned.length; i += 25) {
    await Promise.all(
      planned.slice(i, i + 25).map(async ({ doc, stock, min }: { doc: Document; stock: number | null; min: number | null }) => {
        let changed = false;
        if (min !== null) {
          const res = await items.updateOne({ _id: doc._id, minMilli: null }, { $set: { minMilli: min } });
          if (res.modifiedCount) changed = true;
        }
        if (stock !== null) {
          const res = await items.updateOne({ _id: doc._id, stockMilli: null }, { $set: { stockMilli: stock } });
          if (res.modifiedCount) {
            changed = true;
            try {
              await db.collection("movements").insertOne({
                itemId: doc._id,
                itemName: doc.name,
                category: doc.category,
                uom: doc.uom,
                type: "opening",
                changeMilli: stock,
                beforeMilli: null,
                afterMilli: stock,
                personName,
                note: "",
                accountEmail: user.email,
                accountRole: user.role,
                at,
              });
            } catch (error) {
              await items.updateOne({ _id: doc._id }, { $set: { stockMilli: null } });
              throw error;
            }
          }
        }
        if (changed) saved += 1;
        else skipped += 1;
        const fresh = await items.findOne({ _id: doc._id });
        if (changed && fresh && fresh.stockMilli !== null && fresh.minMilli !== null && fresh.stockMilli <= fresh.minMilli) {
          lowItems.push({ name: fresh.name, uom: fresh.uom, stock: fresh.stockMilli, min: fresh.minMilli });
        }
      }),
    );
  }

  if (lowItems.length) await notifyLow(lowItems, personName);
  return { saved, skipped };
}

export async function updateMin(id: string, value: unknown, user: SessionUser) {
  const db = await getDb();
  const _id = objectId(id);
  const item = await db.collection("items").findOne({ _id, ...ACTIVE });
  if (!item) throw new HttpError(404, "Item not found");
  const min = checkQty(value, item.uom);
  await db.collection("items").updateOne({ _id }, { $set: { minMilli: min } });
  if (item.stockMilli !== null && item.stockMilli <= min && !(item.minMilli !== null && item.stockMilli <= item.minMilli)) {
    await notifyLow([{ name: item.name, uom: item.uom, stock: item.stockMilli, min }], user.name);
  }
  return { min: fromMilli(min) };
}

function parseIds(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 500) throw new HttpError(400, "Select at least one item");
  return value.map(objectId);
}

const auditEntry = (doc: Document, type: "deleted" | "restored", user: SessionUser, at: Date) => {
  const stock = doc.stockMilli ?? 0;
  return {
    itemId: doc._id,
    itemName: doc.name,
    category: doc.category,
    uom: doc.uom,
    type,
    changeMilli: type === "deleted" ? -stock : stock,
    beforeMilli: type === "deleted" ? stock : 0,
    afterMilli: type === "deleted" ? 0 : stock,
    personName: user.name,
    note: "",
    accountEmail: user.email,
    accountRole: user.role,
    at,
  };
};

export async function deleteItems(value: unknown, user: SessionUser) {
  const db = await getDb();
  const ids = parseIds(value);
  const targets = await db.collection("items").find({ _id: { $in: ids }, ...ACTIVE }).toArray();
  if (!targets.length) return { deleted: 0, ids: [] };
  const at = new Date();
  const targetIds = targets.map((t) => t._id);
  await db.collection("items").updateMany({ _id: { $in: targetIds }, ...ACTIVE }, { $set: { deletedAt: at, deletedBy: user.name } });
  await db.collection("movements").insertMany(targets.map((t) => auditEntry(t, "deleted", user, at)));
  return { deleted: targets.length, ids: targetIds.map(String) };
}

export async function restoreItems(value: unknown, user: SessionUser) {
  const db = await getDb();
  const ids = parseIds(value);
  const targets = await db.collection("items").find({ _id: { $in: ids }, deletedAt: { $ne: null } }).toArray();
  if (!targets.length) return { restored: 0 };
  const at = new Date();
  await db.collection("items").updateMany({ _id: { $in: targets.map((t) => t._id) } }, { $unset: { deletedAt: "", deletedBy: "" } });
  await db.collection("movements").insertMany(targets.map((t) => auditEntry(t, "restored", user, at)));
  return { restored: targets.length };
}

export function emailEnabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function notifyLow(rows: { name: string; uom: string; stock: number; min: number }[], personName: string) {
  if (!emailEnabled()) return;
  try {
    const db = await getDb();
    const owner = await db.collection("users").findOne({ role: "owner" });
    if (!owner) return;
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    const lines = rows.map((r) => `${r.name}: ${fmt(r.stock / 1000)} ${r.uom} left (minimum ${fmt(r.min / 1000)})`);
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: owner.email,
      subject: rows.length === 1 ? `Low stock: ${rows[0].name}` : `Low stock: ${rows.length} items`,
      text: `${lines.join("\n")}\n\nLast updated by ${personName}.`,
    });
  } catch (error) {
    // The stock entry is already saved, and the Alerts page still shows it.
    console.error("Low-stock email failed", error);
  }
}
