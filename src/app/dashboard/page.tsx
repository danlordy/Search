import { ShieldCheck } from "lucide-react";
import { AdminPermissionsGuide } from "@/components/admin-permissions-guide";
import { AdminUsersManager } from "@/components/admin-users-manager";
import { Card } from "@/components/ui/card";
import {
  ADMIN_ROLE,
  SU_ROLE,
  canAccessGlobalSettings,
  canManageUserPermissions,
  getSessionUser,
  getUserGrade,
  getUserRole,
} from "@/lib/auth/permissions";
import { requireServerSession } from "@/lib/auth/server";

export const metadata = {
  title: "Dashboard | CMSA",
  description: "Panel protegido para gestionar permisos y configuracion global.",
};

export default async function DashboardPage() {
  const session = await requireServerSession("/dashboard");
  const sessionUser = getSessionUser(session);
  const role = getUserRole(sessionUser);
  const grade = getUserGrade(sessionUser);
  const isAdmin = role === ADMIN_ROLE || role === SU_ROLE;
  const hasGlobalSettingsAccess = canAccessGlobalSettings(sessionUser);
  const canManageUsers = canManageUserPermissions(sessionUser);
  const userName =
    typeof sessionUser?.name === "string" && sessionUser.name.trim()
      ? sessionUser.name
      : "Usuario";
  const userEmail =
    typeof sessionUser?.email === "string" && sessionUser.email.trim()
      ? sessionUser.email
      : "Sin correo";

  return (
    <section className="container mx-auto space-y-6 px-4 py-8 md:px-6">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Dashboard Protegido</h1>
            <p className="text-sm text-muted-foreground">
              Sesion validada en servidor.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Usuario</p>
            <p className="font-medium">{userName}</p>
            <p className="text-muted-foreground">{userEmail}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Permisos</p>
            <p className="font-medium">Rol: {role}</p>
            <p className="text-muted-foreground">Grado: {grade}</p>
            <p className="text-muted-foreground">
              Config global: {hasGlobalSettingsAccess ? "SI" : "NO"}
            </p>
          </div>
        </div>
      </Card>

      {isAdmin ? <AdminPermissionsGuide /> : null}

      {canManageUsers ? (
        <AdminUsersManager />
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          No tienes permiso para gestionar usuarios. Se requiere grado alto o rol admin/SU.
        </Card>
      )}
    </section>
  );
}
