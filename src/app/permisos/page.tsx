import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PermissionsHandler } from "@/components/permissions-handler";
import { canManageUserPermissions, getSessionUser } from "@/lib/auth/permissions";
import { requireServerSession } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Handler de Permisos",
  description: "Gestion visual de permisos por niveles.",
};

export default async function PermisosPage() {
  const session = await requireServerSession("/permisos");
  const user = getSessionUser(session);

  if (!canManageUserPermissions(user)) {
    redirect("/clientes");
  }

  return <PermissionsHandler />;
}
