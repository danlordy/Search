"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, Shield } from "lucide-react";
import { SettingsDialog } from "@/components/settings-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth/client";
import {
  canAccessGlobalSettings,
  canAccessTurnosModule,
  getDefaultLandingPath,
  getUserGrade,
  getUserRole,
  USER_ROLE_LABELS,
} from "@/lib/auth/permissions";

export function AuthControls() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { data: sessionData, isPending } = authClient.useSession();

  const user = sessionData?.user;
  const hasUser = !!user;
  const role = getUserRole(user);
  const grade = getUserGrade(user);
  const hasSettingsAccess = canAccessGlobalSettings(user);
  const hasTurnosAccess = canAccessTurnosModule(user);
  const landingPath = getDefaultLandingPath(user);
  const isLoginPage = pathname === "/login";

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.push("/search");
      router.refresh();
    } catch (error) {
      console.error("Sign out failed:", error);
      toast({
        title: "Error",
        description: "No se pudo cerrar sesión.",
        variant: "destructive",
      });
    }
  };

  if (isPending) {
    return (
      <div className="h-9 w-44 animate-pulse rounded-md bg-muted" aria-hidden />
    );
  }

  if (!hasUser) {
    if (isLoginPage) return null;

    return (
      <Button asChild size="sm" className="gap-2">
        <Link href="/login">
          <LogIn className="h-4 w-4" />
          Iniciar Sesion
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="hidden md:inline-flex">
        <Shield className="mr-1 h-3 w-3" />
        {USER_ROLE_LABELS[role]} · G{grade}
      </Badge>
      {hasSettingsAccess ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Dashboard</Link>
        </Button>
      ) : hasTurnosAccess ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/turnos">Mi Panel</Link>
        </Button>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link href={landingPath}>Mi Panel</Link>
        </Button>
      )}
      {hasSettingsAccess ? <SettingsDialog /> : null}
      <Button variant="ghost" size="icon" onClick={handleSignOut} title="Cerrar sesion">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
