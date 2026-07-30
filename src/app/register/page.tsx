import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getSession();
  if (session.userId) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { status: true },
    });
    if (user?.status === "ACTIVE") redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-display text-text">Daftar</h1>
          <p className="mt-1 text-body text-text-muted">
            Buat akun baru. Admin harus approve sebelum bisa login.
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
