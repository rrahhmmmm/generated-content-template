import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";
import { getSession, type SessionRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Generated Content — Multi-akun video",
  description: "Satu klip masuk, 10 video keluar dengan overlay template tiap akun.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Re-query status supaya session yang basi tidak render AppShell.
  // Kalau invalid, children di-render langsung (halaman /login /register punya
  // layout sendiri; halaman protected akan redirect via requireUserPage()).
  const session = await getSession();
  let authed: { name: string; role: SessionRole } | null = null;
  if (session.userId && session.name && session.role) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { status: true, role: true },
    });
    if (user?.status === "ACTIVE") {
      authed = { name: session.name, role: (user.role as SessionRole) ?? session.role };
    }
  }

  return (
    <html lang="id" suppressHydrationWarning className={inter.variable}>
      <body>
        <ThemeProvider>
          {authed ? <AppShell session={authed}>{children}</AppShell> : children}
        </ThemeProvider>
      </body>
    </html>
  );
}
