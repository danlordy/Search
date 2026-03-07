import type { Metadata } from "next";
import { ClientTicketBooking } from "@/components/client-ticket-booking";

export const metadata: Metadata = {
  title: "Clientes | Sistema de Turnos",
  description: "Agenda de tickets para servicio, caja y digitacion.",
};

export default function ClientesPage() {
  return <ClientTicketBooking />;
}
