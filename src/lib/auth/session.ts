import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type SessionOptions } from "iron-session";
import { prisma } from "@/lib/db";

export type SessionRole = "ADMIN" | "USER";

export type SessionData = {
  userId?: string;
  email?: string;
  role?: SessionRole;
  name?: string;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} wajib di-set (lihat .env.example)`);
  return v;
}

export const sessionOptions: SessionOptions = {
  password: requiredEnv("SESSION_PASSWORD"),
  cookieName: process.env.SESSION_COOKIE_NAME || "genc_session",
  ttl: 60 * 60 * 24 * 7, // 7 hari
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

// ==============================
// Route Handler variants (boleh mutate cookie)
// ==============================

class HttpError extends Error {
  constructor(public status: number, public payload: unknown) {
    super(typeof payload === "string" ? payload : JSON.stringify(payload));
  }
  toResponse(): Response {
    return new Response(
      typeof this.payload === "string"
        ? JSON.stringify({ error: this.payload })
        : JSON.stringify(this.payload),
      {
        status: this.status,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

/**
 * Panggil di awal Route Handler. Lempar Response 401/403 kalau tidak valid.
 * Re-query DB status supaya reject/deactivate langsung berlaku (tidak tunggu
 * 7 hari session expire). Cost: 1 SELECT per request.
 *
 * Cara pakai:
 *   try { const s = await requireUser(); ... }
 *   catch (err) { if (err instanceof HttpError) return err.toResponse(); throw err; }
 *
 * Atau gunakan helper `withAuth` di bawah.
 */
export async function requireUser(): Promise<Required<SessionData>> {
  const session = await getSession();
  if (!session.userId || !session.email || !session.role || !session.name) {
    throw new HttpError(401, "Unauthorized");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, role: true },
  });
  if (!user || user.status !== "ACTIVE") {
    await session.destroy();
    throw new HttpError(401, "Session tidak valid");
  }
  return {
    userId: session.userId,
    email: session.email,
    role: (user.role as SessionRole) ?? session.role,
    name: session.name,
  };
}

export async function requireAdmin(): Promise<Required<SessionData>> {
  const s = await requireUser();
  if (s.role !== "ADMIN") {
    throw new HttpError(403, "Forbidden — hanya admin yang bisa mengakses");
  }
  return s;
}

/**
 * Wrap Route Handler supaya HttpError otomatis di-return sebagai Response.
 * Contoh:
 *   export const POST = withAuth(async (req) => { ... });
 */
export function withAuth<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
  gate: "user" | "admin" = "user"
) {
  return async (...args: T): Promise<Response> => {
    try {
      if (gate === "admin") await requireAdmin();
      else await requireUser();
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return err.toResponse();
      throw err;
    }
  };
}

/**
 * Inline gate helper. Pakai di awal handler:
 *   const gate = await assertUser();
 *   if (gate) return gate;
 *   // ... logic normal
 * Return null kalau valid, Response 401/403 kalau tidak.
 */
export async function assertUser(): Promise<Response | null> {
  try {
    await requireUser();
    return null;
  } catch (err) {
    if (err instanceof HttpError) return err.toResponse();
    throw err;
  }
}

export async function assertAdmin(): Promise<Response | null> {
  try {
    await requireAdmin();
    return null;
  } catch (err) {
    if (err instanceof HttpError) return err.toResponse();
    throw err;
  }
}

export { HttpError };

// ==============================
// Server Component variants (TIDAK boleh mutate cookie)
// ==============================

/**
 * Panggil di awal Server Component protected page. Redirect kalau tidak valid.
 * PENTING: tidak boleh session.destroy() di sini — Next.js melarang cookie
 * mutation di Server Component. Cookie invalid akan di-overwrite saat user
 * login berikutnya, atau expire natural.
 */
export async function requireUserPage(
  nextPath?: string
): Promise<Required<SessionData>> {
  const session = await getSession();
  const target = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
  if (!session.userId || !session.email || !session.role || !session.name) {
    redirect(target);
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { status: true, role: true },
  });
  if (!user || user.status !== "ACTIVE") {
    redirect(target);
  }
  return {
    userId: session.userId,
    email: session.email,
    role: (user.role as SessionRole) ?? session.role,
    name: session.name,
  };
}

export async function requireAdminPage(nextPath?: string): Promise<Required<SessionData>> {
  const s = await requireUserPage(nextPath);
  if (s.role !== "ADMIN") {
    redirect("/");
  }
  return s;
}
