import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketsOperatorDashboard } from "@/components/tickets-operator-dashboard";
import { canAccessTurnosModule, getSessionUser } from "@/lib/auth/permissions";
import { requireServerSession } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Turnos | Panel Interno",
  description: "Gestion interna de tickets para servicio, caja y digitacion.",
};

export default async function TurnosPage() {
  const session = await requireServerSession("/turnos");
  const user = getSessionUser(session);

  if (!canAccessTurnosModule(user)) {
    redirect("/clientes");
  }

  return <TicketsOperatorDashboard />;
}
