import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/accounts", label: "Akun" },
  { href: "/groups", label: "Group" },
  { href: "/create", label: "Buat" },
  { href: "/jobs", label: "Riwayat" },
  { href: "/settings", label: "Pengaturan" },
  { href: "/kitchen-sink", label: "Kitchen Sink" },
];

const ADMIN_NAV = [{ href: "/admin/users", label: "Admin" }];

export function AppShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: { name: string; role: "ADMIN" | "USER" };
}) {
  const nav = session.role === "ADMIN" ? [...NAV, ...ADMIN_NAV] : NAV;
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-6">
            <Link href="/accounts" className="text-label font-medium text-text">
              GenContent
            </Link>
            <nav className="flex items-center gap-4">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-label text-text-muted hover:text-text"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-caption text-text-muted">{session.name}</span>
            <LogoutButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
