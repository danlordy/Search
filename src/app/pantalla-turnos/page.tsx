import type { Metadata } from "next";
import { TicketsDisplayBoard } from "@/components/tickets-display-board";

export const metadata: Metadata = {
  title: "Pantalla de Turnos",
  description: "Visualizacion publica de turnos activos, siguientes y en espera.",
};

export default function TurnosDisplayPage() {
  return <TicketsDisplayBoard />;
}
