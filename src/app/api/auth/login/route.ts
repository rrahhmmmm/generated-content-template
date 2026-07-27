import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { getSession, type SessionRole } from "@/lib/auth/session";
import { checkLoginRateLimit, extractIp } from "@/lib/auth/rate-limit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const ip = extractIp(req);
  const rl = checkLoginRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Terlalu banyak percobaan. Coba lagi dalam ${rl.retryAfter} detik.` },
      { status: 429, headers: { "retry-after": String(rl.retryAfter) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Email atau password salah" }, { status: 401 });
  }

  if (user.status === "PENDING") {
    return NextResponse.json(
      { error: "Akun Anda masih menunggu approval admin" },
      { status: 403 }
    );
  }
  if (user.status === "REJECTED") {
    return NextResponse.json(
      { error: "Akun Anda tidak diaktifkan. Hubungi admin." },
      { status: 403 }
    );
  }
  if (user.status !== "ACTIVE") {
    return NextResponse.json({ error: "Akun tidak dapat login" }, { status: 403 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.name = user.name;
  session.role = user.role as SessionRole;
  await session.save();

  return NextResponse.json({ ok: true, role: user.role });
}
