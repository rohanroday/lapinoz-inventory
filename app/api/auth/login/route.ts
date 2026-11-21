import bcrypt from "bcryptjs";
import { handle, HttpError, readBody, startSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

const MAX_FAILS = 8;
const DUMMY_HASH = "$2b$11$C6UzMDM.H6dfI/f/IKcEeO7ZyZ2d6wJ2YkYFvH3qk7w8c0m3l2n1K";

export const POST = handle(async (req) => {
  const body = await readBody(req);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(body.password ?? "").slice(0, 200);
  if (!email || !password) throw new HttpError(400, "Enter your email and password");

  const db = await getDb();
  const attempts = db.collection<{ _id: string; count: number; at: Date }>("loginAttempts");
  const seen = await attempts.findOne({ _id: email });
  if (seen && seen.count >= MAX_FAILS) throw new HttpError(429, "Too many wrong attempts. Try again in 15 minutes.");

  const user = await db.collection("users").findOne({ email });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    await attempts.updateOne({ _id: email }, { $inc: { count: 1 }, $setOnInsert: { at: new Date() } }, { upsert: true });
    throw new HttpError(401, "Wrong email or password");
  }

  await attempts.deleteOne({ _id: email });
  await startSession({ email: user.email, name: user.name, role: user.role });
  return { ok: true };
});
