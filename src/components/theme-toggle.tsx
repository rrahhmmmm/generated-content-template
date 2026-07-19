"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = mounted ? resolvedTheme : "light";
  const next = active === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(next)}
      aria-label={`Ubah ke ${next} mode`}
      title={mounted ? `Ubah ke ${next}` : "Ubah tema"}
    >
      {active === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
