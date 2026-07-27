import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();

  // Kalau session valid + user masih ACTIVE, redirect. Kalau decrypt gagal
  // atau status tidak ACTIVE, biarkan render form (jangan destroy — RSC tidak
  // boleh mutate cookie; nanti di-overwrite saat login sukses).
  if (session.userId) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { status: true },
    });
    if (user?.status === "ACTIVE") {
      redirect(params.next || "/");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-display text-text">Masuk</h1>
          <p className="mt-1 text-body text-text-muted">
            Login untuk mengakses GenContent.
          </p>
        </div>
        <LoginForm next={params.next} />
      </div>
    </div>
  );
}
