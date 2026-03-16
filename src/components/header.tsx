"use client";

import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { SettingsDialog } from "@/components/settings-dialog";

const NAV_LINKS = [
  { href: "/search", label: "Buscar", icon: Search },
  { href: "/documents", label: "Documentos", icon: FileText },
];

export function Header() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/search" && pathname === "/") return true;
    return pathname === href;
  };

  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors duration-200 ${
                      isActive(link.href)
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="hidden sm:inline text-sm">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center">
            <SettingsDialog />
          </div>
        </div>
      </div>
    </header>
  );
}
