"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  TICKET_SERVICE_LABELS,
  formatTicketDisplayCode,
  type TicketServiceType,
  type TicketStatus,
} from "@/lib/tickets-shared";

type ApiTicket = {
  id: string;
  ticketNumber: string;
  serviceType: TicketServiceType;
  status: TicketStatus;
  clientName: string;
  calledAt: number | null;
  createdAt: number;
};

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCallPhrase(ticket: ApiTicket) {
  const displayCode = formatTicketDisplayCode(ticket.serviceType, ticket.ticketNumber);
  return `Usuario número ${displayCode.replace("-", " ")}, pasar a estación ${TICKET_SERVICE_LABELS[ticket.serviceType]} que corresponde.`;
}

export function TicketsDisplayBoard() {
  const [tickets, setTickets] = useState<ApiTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [lastAnnouncedText, setLastAnnouncedText] = useState("");
  const lastAnnouncedKeyRef = useRef<string>("");

  const fetchBoard = useCallback(
    async (background = false) => {
      if (!background) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("scheduledDate", getTodayDateInput());
        params.set("includeClosed", "false");
        params.set("limit", "800");

        const response = await fetch(`/api/tickets?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || "No se pudo cargar la pantalla de turnos.");
        }

        const data = (await response.json()) as {
          tickets?: ApiTicket[];
        };
        const rows = Array.isArray(data.tickets) ? data.tickets : [];
        setTickets(rows.filter((row) => row.status === "llamado"));
        setError("");
        setLastSync(Date.now());
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "No se pudo cargar la pantalla de turnos.";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchBoard(true);
    }, 6000);

    return () => window.clearInterval(intervalId);
  }, [fetchBoard]);

  const activeTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const aTs = a.calledAt || a.createdAt;
      const bTs = b.calledAt || b.createdAt;
      return bTs - aTs;
    });
  }, [tickets]);

  const latestCalledTicket = activeTickets[0] || null;

  useEffect(() => {
    if (!latestCalledTicket) return;

    const announceKey = `${latestCalledTicket.id}:${latestCalledTicket.calledAt || latestCalledTicket.createdAt}`;
    if (announceKey === lastAnnouncedKeyRef.current) return;

    lastAnnouncedKeyRef.current = announceKey;
    const text = formatCallPhrase(latestCalledTicket);
    setLastAnnouncedText(text);

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-DO";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [latestCalledTicket]);

  return (
    <section className="flex min-h-screen items-center justify-center px-4 py-8 md:px-6">
      <div className="w-full max-w-6xl space-y-6">
        {error ? (
          <Card className="rounded-2xl border border-destructive/60 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </Card>
        ) : null}

        {loading ? (
          <Card className="flex items-center justify-center gap-2 rounded-3xl p-8 text-lg text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Cargando pantalla de turnos...
          </Card>
        ) : null}

        {!loading ? (
          <Card className="rounded-3xl border bg-card/90 p-6 shadow-xl md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm uppercase tracking-[0.3em] text-primary">
                Turnos activos
              </p>
              <p className="text-sm text-muted-foreground">
                Llamados en proceso: {activeTickets.length}
              </p>
            </div>

            {activeTickets.length === 0 ? (
              <div className="mt-6 rounded-2xl border bg-card/70 p-6 text-center text-xl text-muted-foreground">
                No hay turnos activos en este momento.
              </div>
            ) : (
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {activeTickets.map((ticket) => {
                  const display = formatTicketDisplayCode(
                    ticket.serviceType,
                    ticket.ticketNumber,
                  );

                  return (
                    <div
                      key={ticket.id}
                      className="rounded-2xl border bg-card/80 p-5 text-center"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {TICKET_SERVICE_LABELS[ticket.serviceType]}
                      </p>
                      <p className="mt-2 font-mono text-6xl font-bold tracking-wide md:text-7xl">
                        {display}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Usuario: {ticket.clientName}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        {!loading ? (
          <Card className="rounded-2xl border bg-card/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <p>
                Ultima sincronizacion:{" "}
                {lastSync
                  ? new Date(lastSync).toLocaleTimeString("es-DO")
                  : "--:--:--"}
              </p>
              <p className="flex items-center gap-2">
                <Volume2 className="h-4 w-4" />
                Audio activo
              </p>
            </div>
            {lastAnnouncedText ? (
              <p className="mt-2 text-xs text-muted-foreground">{lastAnnouncedText}</p>
            ) : null}
          </Card>
        ) : null}
      </div>
    </section>
  );
}
