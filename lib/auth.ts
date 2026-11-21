import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

export type SessionUser = { email: string; name: string; role: "owner" | "employee" };

const COOKIE = "inventory_session";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET in .env must be at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function startSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { email: String(payload.email), name: String(payload.name), role: payload.role as SessionUser["role"] };
  } catch {
    return null;
  }
}

export async function requirePageUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireApiUser(role?: "owner") {
  const user = await getUser();
  if (!user) throw new HttpError(401, "Please log in again");
  if (role && user.role !== role) throw new HttpError(403, "Only the owner can do this");
  return user;
}

export function handle<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      return NextResponse.json(await fn(req, ctx));
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error(error);
      return NextResponse.json({ error: "Something went wrong. Nothing was saved, please try again." }, { status: 500 });
    }
  };
}

export async function readBody(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body;
  } catch {}
  throw new HttpError(400, "Invalid request");
}
