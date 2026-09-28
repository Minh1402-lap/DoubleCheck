import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

const COOKIE = "doublecheck_session";
export async function sessionIdentity(): Promise<{ raw: string; hash: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  const raw = existing ?? randomBytes(32).toString("base64url");
  const hash = createHmac("sha256", env().SESSION_SECRET).update(raw).digest("hex");
  return { raw, hash, isNew: !existing };
}
export function setSessionCookie(raw: string) {
  return `${COOKIE}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
