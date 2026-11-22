import { Db, MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import seedItems from "@/data/items.json";

const store = globalThis as unknown as { inventoryDb?: Promise<Db> };

export function getDb() {
  if (!store.inventoryDb) {
    store.inventoryDb = init().catch((error) => {
      store.inventoryDb = undefined;
      throw error;
    });
  }
  return store.inventoryDb;
}

async function init() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is empty. Paste your MongoDB link in the .env file.");
  const client = await new MongoClient(uri).connect();
  const db = client.db(process.env.MONGODB_DB || "lapinoz_inventory");

  await Promise.all([
    db.collection("items").createIndex({ nameKey: 1 }, { unique: true }),
    db.collection("users").createIndex({ role: 1 }, { unique: true }),
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("movements").createIndex({ requestId: 1 }, { unique: true, sparse: true }),
    db.collection("movements").createIndex({ at: -1 }),
    // One open request per item, so a double tap or a second person cannot duplicate it.
    db.collection("requests").createIndex({ itemId: 1 }, { unique: true, partialFilterExpression: { status: "open" } }),
    db.collection("loginAttempts").createIndex({ at: 1 }, { expireAfterSeconds: 900 }),
  ]);

  // $setOnInsert means a restart can never overwrite real stock numbers.
  await db.collection("items").bulkWrite(
    seedItems.map((item) => ({
      updateOne: {
        filter: { nameKey: item.name.toLowerCase() },
        update: {
          $setOnInsert: {
            name: item.name,
            nameKey: item.name.toLowerCase(),
            category: item.category,
            uom: item.uom,
            order: item.order,
            orderedQty: item.orderedQty,
            stockMilli: null,
            minMilli: null,
          },
        },
        upsert: true,
      },
    })),
  );

  await syncAccount(db, "owner", "OWNER");
  await syncAccount(db, "employee", "EMPLOYEE");
  return db;
}

async function syncAccount(db: Db, role: string, prefix: string) {
  const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
  const password = process.env[`${prefix}_PASSWORD`];
  const name = process.env[`${prefix}_NAME`]?.trim();
  if (!email || !password || !name) {
    throw new Error(`Fill ${prefix}_NAME, ${prefix}_EMAIL and ${prefix}_PASSWORD in the .env file.`);
  }
  if (password.length < 8) throw new Error(`${prefix}_PASSWORD must be at least 8 characters.`);

  const users = db.collection("users");
  const current = await users.findOne({ role });
  const same = current && (await bcrypt.compare(password, current.passwordHash));
  const passwordHash = same ? current.passwordHash : await bcrypt.hash(password, 11);
  await users.updateOne({ role }, { $set: { role, email, name, passwordHash } }, { upsert: true });
}
