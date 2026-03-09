"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  FilePenLine,
  Headset,
  Loader2,
  Megaphone,
  Ticket,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  TICKET_SERVICE_LABELS,
  TICKET_STATUS_LABELS,
  type TicketServiceType,
  type TicketStatus,
} from "@/lib/tickets-shared";
import { cn } from "@/lib/utils";

type ApiTicket = {
  id: string;
  ticketNumber: string;
  serviceType: TicketServiceType;
  status: TicketStatus;
  clientName: string;
  clientNote: string | null;
  scheduledDate: string;
  scheduledTime: string | null;
  createdAt: number;
};

type ApiSummary = {
  byStatus: Record<TicketStatus, number>;
  byService: Record<TicketServiceType, Record<TicketStatus, number>>;
  total: number;
};

type CreateTicketResponse = {
  ticket: ApiTicket;
  queuePosition: number;
  estimatedWaitMinutes: number;
};

const SERVICE_OPTIONS: Array<{
  value: TicketServiceType;
  description: string;
  icon: typeof Headset;
}> = [
  {
    value: "servicio",
    description: "Consultas generales y soporte.",
    icon: Headset,
  },
  {
    value: "caja",
    description: "Pagos, recibos y transacciones.",
    icon: Banknote,
  },
  {
    value: "digitacion",
    description: "Captura y validacion de datos.",
    icon: FilePenLine,
  },
];

const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["llamado", "pendiente"];

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeFromMillis(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "--:--";
  return new Date(timestamp).toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadgeClass(status: TicketStatus) {
  if (status === "llamado") {
    return "bg-blue-600 text-white";
  }
  if (status === "pendiente") {
    return "bg-amber-500 text-white";
  }
  if (status === "atendido") {
    return "bg-emerald-600 text-white";
  }
  return "bg-zinc-500 text-white";
}

export function ClientTicketBooking() {
  const { toast } = useToast();
  const [serviceType, setServiceType] = useState<TicketServiceType>("servicio");
  const [clientName, setClientName] = useState("");
  const [clientNote, setClientNote] = useState("");
  const [scheduledDate, setScheduledDate] = useState(getTodayDateInput());
  const [scheduledTime, setScheduledTime] = useState("");
  const [serviceFilter, setServiceFilter] = useState<"todos" | TicketServiceType>("todos");
  const [tickets, setTickets] = useState<ApiTicket[]>([]);
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [latestCreated, setLatestCreated] = useState<CreateTicketResponse | null>(null);

  const refreshTickets = useCallback(async () => {
    setLoadingList(true);
    try {
      const params = new URLSearchParams();
      params.set("scheduledDate", scheduledDate);
      params.set("includeClosed", "false");
      params.set("limit", "300");
      if (serviceFilter !== "todos") {
        params.set("serviceType", serviceFilter);
      }

      const response = await fetch(`/api/tickets?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo cargar la cola de tickets.");
      }

      const data = (await response.json()) as {
        tickets?: ApiTicket[];
        summary?: ApiSummary;
      };

      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error("Ticket list load failed:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo cargar la cola.",
        variant: "destructive",
      });
    } finally {
      setLoadingList(false);
    }
  }, [scheduledDate, serviceFilter, toast]);

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshTickets();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [refreshTickets]);

  const activeTickets = useMemo(
    () => tickets.filter((ticket) => ACTIVE_TICKET_STATUSES.includes(ticket.status)),
    [tickets],
  );

  const handleCreateTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!clientName.trim()) {
      toast({
        title: "Nombre requerido",
        description: "Ingresa el nombre del cliente para agendar el ticket.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceType,
          clientName: clientName.trim(),
          clientNote: clientNote.trim(),
          scheduledDate,
          scheduledTime: scheduledTime.trim(),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | {
            error?: string;
          }
        | CreateTicketResponse;

      if (!response.ok) {
        const message =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "No se pudo agendar el ticket.";
        throw new Error(message);
      }

      const created = data as CreateTicketResponse;
      setLatestCreated(created);
      setClientNote("");
      setScheduledTime("");
      await refreshTickets();

      toast({
        title: "Ticket agendado",
        description: `Tu numero es ${created.ticket.ticketNumber}.`,
      });
    } catch (error) {
      console.error("Ticket create failed:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo agendar el ticket.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = summary?.byStatus.pendiente || 0;
  const calledCount = summary?.byStatus.llamado || 0;

  return (
    <section className="container mx-auto px-4 py-8 md:px-6">
      <div className="mb-6 rounded-3xl border bg-card/85 p-6 shadow-xl backdrop-blur-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Sistema de Turnos
        </p>
        <h1 className="mt-2 text-3xl font-bold md:text-4xl">Agenda tu ticket</h1>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">
          Reserva ticket para servicio, caja o digitacion. La cola se actualiza en
          tiempo real para que tengas visibilidad del turno.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border bg-card/85 p-5 shadow-lg backdrop-blur-sm md:p-6">
          <form className="space-y-5" onSubmit={handleCreateTicket}>
            <div className="space-y-2">
              <Label>Tipo de atencion</Label>
              <div className="grid gap-2 md:grid-cols-3">
                {SERVICE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = serviceType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setServiceType(option.value)}
                      className={cn(
                        "rounded-2xl border p-4 text-left transition",
                        selected
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "bg-background/70 hover:border-primary/50 hover:bg-accent/50",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <p className="font-semibold">{TICKET_SERVICE_LABELS[option.value]}</p>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="client-name">Nombre del cliente</Label>
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  placeholder="Ej: Maria Lopez"
                  maxLength={80}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="scheduled-date">Fecha</Label>
                <Input
                  id="scheduled-date"
                  type="date"
                  value={scheduledDate}
                  onChange={(event) => setScheduledDate(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="scheduled-time">Hora preferida (opcional)</Label>
                <Input
                  id="scheduled-time"
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => setScheduledTime(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="client-note">Detalle (opcional)</Label>
                <Textarea
                  id="client-note"
                  value={clientNote}
                  onChange={(event) => setClientNote(event.target.value)}
                  placeholder="Escribe una nota corta"
                  maxLength={300}
                  className="min-h-10"
                />
              </div>
            </div>

            <Button type="submit" className="w-full font-semibold" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Agendando...
                </>
              ) : (
                <>
                  <Ticket className="mr-2 h-4 w-4" />
                  Agendar ticket
                </>
              )}
            </Button>
          </form>

          {latestCreated ? (
            <div className="mt-5 rounded-2xl border border-primary/40 bg-primary/10 p-4">
              <p className="text-xs uppercase tracking-wide text-primary">Ticket creado</p>
              <p className="mt-1 text-2xl font-bold">{latestCreated.ticket.ticketNumber}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Posicion estimada en cola:{" "}
                <span className="font-semibold text-foreground">
                  {latestCreated.queuePosition}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Tiempo estimado:{" "}
                <span className="font-semibold text-foreground">
                  {latestCreated.estimatedWaitMinutes} min
                </span>
              </p>
            </div>
          ) : null}
        </Card>

        <Card className="rounded-3xl border bg-card/85 p-5 shadow-lg backdrop-blur-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">Cola del dia</h2>
              <p className="text-sm text-muted-foreground">{scheduledDate}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge className="bg-amber-500 text-white">Pendientes: {pendingCount}</Badge>
              <Badge className="bg-blue-600 text-white">Llamados: {calledCount}</Badge>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={serviceFilter === "todos" ? "default" : "outline"}
              onClick={() => setServiceFilter("todos")}
            >
              Todos
            </Button>
            {SERVICE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={serviceFilter === option.value ? "default" : "outline"}
                onClick={() => setServiceFilter(option.value)}
              >
                {TICKET_SERVICE_LABELS[option.value]}
              </Button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {loadingList ? (
              <div className="flex items-center gap-2 rounded-xl border bg-background/70 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando tickets...
              </div>
            ) : null}

            {!loadingList && activeTickets.length === 0 ? (
              <div className="rounded-xl border bg-background/70 p-4 text-sm text-muted-foreground">
                No hay tickets activos para la fecha seleccionada.
              </div>
            ) : null}

            {activeTickets.slice(0, 12).map((ticket) => (
              <div
                key={ticket.id}
                className={cn(
                  "rounded-xl border p-3 transition",
                  ticket.status === "llamado"
                    ? "border-blue-500/60 bg-blue-500/10"
                    : "bg-background/70",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{ticket.ticketNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {TICKET_SERVICE_LABELS[ticket.serviceType]} ·{" "}
                      {ticket.scheduledTime || formatTimeFromMillis(ticket.createdAt)}
                    </p>
                  </div>
                  <Badge className={getStatusBadgeClass(ticket.status)}>
                    {ticket.status === "llamado" ? (
                      <Megaphone className="mr-1 h-3 w-3" />
                    ) : null}
                    {TICKET_STATUS_LABELS[ticket.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{ticket.clientName}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
