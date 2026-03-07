"use client";

import Link from "next/link";
import {
  ChevronDown,
  FileText,
  Home,
  MonitorSmartphone,
  Search,
  ShieldCheck,
  Ticket,
  Timer,
  Tv,
  UsersRound,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { AuthControls } from "@/components/auth-controls";
import { authClient } from "@/lib/auth/client";
import {
  canAccessGlobalSettings,
  canAccessTurnosModule,
  canManageUserPermissions,
} from "@/lib/auth/permissions";

export function Header() {
  const pathname = usePathname();
  const { data: sessionData } = authClient.useSession();
  const user = sessionData?.user;
  const hasUser = !!user;
  const hasTurnosAccess = canAccessTurnosModule(user);
  const hasGlobalAccess = canAccessGlobalSettings(user);
  const hasPermissionHandlerAccess = canManageUserPermissions(user);

  if (pathname === "/pantalla-turnos" || pathname === "/terminal-turnos") {
    return null;
  }

  const navLinks = [
    { href: "/", label: "Inicio", icon: Home },
    { href: "/search", label: "Buscar", icon: Search },
  ];

  if (hasUser) {
    navLinks.push({ href: "/cronometer", label: "Cronometro", icon: Timer });
  }

  if (hasGlobalAccess) {
    navLinks.push({ href: "/documents", label: "Documentos", icon: FileText });
  }

  const turnosLinks = [
    {
      href: "/clientes",
      label: "Agenda de Clientes",
      description: "Registrar turnos para clientes.",
      icon: UsersRound,
      visible: true,
    },
    {
      href: "/terminal-turnos",
      label: "Terminal",
      description: "Toma de turnos en kiosco.",
      icon: MonitorSmartphone,
      visible: true,
    },
    {
      href: "/pantalla-turnos",
      label: "Pantalla",
      description: "Visualizacion publica de turnos.",
      icon: Tv,
      visible: true,
    },
    {
      href: "/turnos",
      label: "Gestion de Turnos",
      description: "Gestion de cola y atenciones.",
      icon: Ticket,
      visible: hasTurnosAccess,
    },
    {
      href: "/permisos",
      label: "Handler Permisos",
      description: "Control de permisos por flujo.",
      icon: ShieldCheck,
      visible: hasPermissionHandlerAccess,
    },
  ].filter((link) => link.visible);

  const isActive = (href: string) => {
    return pathname === href;
  };

  const isTurnosActive = turnosLinks.some((link) => pathname === link.href);

  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Navegación izquierda */}
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors duration-200 ${isActive(link.href)
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="hidden sm:inline text-sm">{link.label}</span>
                </Link>
              );
            })}

            <div className="group relative">
              <button
                type="button"
                className={`flex items-center gap-2 rounded-md px-4 py-2 transition-colors duration-200 ${isTurnosActive
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
              >
                <Ticket className="h-5 w-5" />
                <span className="hidden sm:inline text-sm">Turnos</span>
                <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
              </button>

              <div className="pointer-events-none invisible absolute left-0 top-full z-50 w-[22rem] translate-y-1 pt-2 opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <div className="rounded-xl border bg-card/95 p-3 shadow-2xl backdrop-blur">
                  <p className="px-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Modulo de Turnos
                  </p>
                  <div className="mt-2 grid gap-1">
                    {turnosLinks.map((link) => {
                      const Icon = link.icon;
                      const active = isActive(link.href);

                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`rounded-lg border px-3 py-2 transition ${active
                              ? "border-primary bg-primary/10"
                              : "border-transparent hover:border-primary/30 hover:bg-accent/60"
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <p className="text-sm font-semibold">{link.label}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </nav>

          {/* Configuración - lado derecho */}
          <div className="flex items-center">
            <AuthControls />
          </div>
        </div>
      </div>
    </header>
  );
}
