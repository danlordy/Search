import type { Metadata } from "next";
import { TicketTerminalKiosk } from "@/components/ticket-terminal-kiosk";

export const metadata: Metadata = {
  title: "Terminal de Turnos",
  description: "Toma de turnos manual para servicio, caja y digitacion.",
};

export default function TerminalTurnosPage() {
  return <TicketTerminalKiosk />;
}
