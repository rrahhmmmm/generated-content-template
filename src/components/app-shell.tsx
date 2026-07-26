import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/accounts", label: "Akun" },
  { href: "/groups", label: "Group" },
  { href: "/create", label: "Buat" },
  { href: "/jobs", label: "Riwayat" },
  { href: "/settings", label: "Pengaturan" },
  { href: "/kitchen-sink", label: "Kitchen Sink" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/accounts" className="text-label font-medium text-text">
              GenContent
            </Link>
            <nav className="flex items-center gap-4">
              {NAV.map((item) => (
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
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
