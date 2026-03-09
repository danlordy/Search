"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCheck,
  Clock3,
  Loader2,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import {
  canCreateTicketForService,
  canOperateTicketService,
} from "@/lib/auth/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  TICKET_SERVICE_LABELS,
  TICKET_SERVICE_TYPES,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
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
  calledAt: number | null;
  attendedAt: number | null;
  createdAt: number;
};

type ApiSummary = {
  byStatus: Record<TicketStatus, number>;
  byService: Record<TicketServiceType, Record<TicketStatus, number>>;
  total: number;
};

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTicketTime(ticket: ApiTicket) {
  if (ticket.scheduledTime) return ticket.scheduledTime;
  if (!Number.isFinite(ticket.createdAt) || ticket.createdAt <= 0) return "--:--";
  return new Date(ticket.createdAt).toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusClass(status: TicketStatus) {
  if (status === "llamado") return "bg-blue-600 text-white";
  if (status === "pendiente") return "bg-amber-500 text-white";
  if (status === "atendido") return "bg-emerald-600 text-white";
  return "bg-zinc-500 text-white";
}

const STATUS_FILTERS: Array<"todos" | TicketStatus> = [
  "todos",
  ...TICKET_STATUSES,
];

export function TicketsOperatorDashboard() {
  const { toast } = useToast();
  const { data: sessionData } = authClient.useSession();
  const sessionUser = sessionData?.user;
  const [scheduledDate, setScheduledDate] = useState(getTodayDateInput());
  const [statusFilter, setStatusFilter] = useState<"todos" | TicketStatus>("todos");
  const [tickets, setTickets] = useState<ApiTicket[]>([]);
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [callingService, setCallingService] = useState<TicketServiceType | null>(null);
  const [createServiceType, setCreateServiceType] = useState<TicketServiceType>("servicio");
  const [createClientName, setCreateClientName] = useState("");
  const [createClientNote, setCreateClientNote] = useState("");
  const [creatingTicket, setCreatingTicket] = useState(false);

  const refreshTickets = useCallback(
    async (isBackground = false) => {
      if (isBackground) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("scheduledDate", scheduledDate);
        params.set("includeClosed", "true");
        params.set("limit", "600");

        const response = await fetch(`/api/tickets?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || "No se pudo cargar el tablero.");
        }

        const data = (await response.json()) as {
          tickets?: ApiTicket[];
          summary?: ApiSummary;
        };

        setTickets(Array.isArray(data.tickets) ? data.tickets : []);
        setSummary(data.summary || null);
      } catch (error) {
        console.error("Tickets dashboard load failed:", error);
        if (!isBackground) {
          toast({
            title: "Error",
            description:
              error instanceof Error ? error.message : "No se pudo cargar los tickets.",
            variant: "destructive",
          });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [scheduledDate, toast],
  );

  useEffect(() => {
    refreshTickets();
  }, [refreshTickets]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshTickets(true);
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [refreshTickets]);

  const allowedServiceTypes = useMemo(() => {
    return TICKET_SERVICE_TYPES.filter((serviceType) =>
      canOperateTicketService(sessionUser, serviceType),
    );
  }, [sessionUser]);

  const creatableServiceTypes = useMemo(() => {
    return TICKET_SERVICE_TYPES.filter((serviceType) =>
      canCreateTicketForService(sessionUser, serviceType),
    );
  }, [sessionUser]);

  useEffect(() => {
    if (creatableServiceTypes.length === 0) return;
    if (!creatableServiceTypes.includes(createServiceType)) {
      setCreateServiceType(creatableServiceTypes[0]);
    }
  }, [createServiceType, creatableServiceTypes]);

  const visibleTickets = useMemo(() => {
    return tickets.filter((ticket) =>
      canOperateTicketService(sessionUser, ticket.serviceType),
    );
  }, [sessionUser, tickets]);

  const filteredTickets = useMemo(() => {
    if (statusFilter === "todos") return visibleTickets;
    return visibleTickets.filter((ticket) => ticket.status === statusFilter);
  }, [statusFilter, visibleTickets]);

  const operatorName = useMemo(() => {
    const value = sessionData?.user?.name;
    return typeof value === "string" && value.trim() ? value : "Operador";
  }, [sessionData?.user?.name]);

  const applyStatus = async (ticketId: string, nextStatus: TicketStatus) => {
    const actionKey = `${ticketId}:${nextStatus}`;
    setBusyAction(actionKey);

    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el ticket.");
      }

      await refreshTickets(true);
      toast({
        title: "Ticket actualizado",
        description: "El estado del ticket fue actualizado.",
      });
    } catch (error) {
      console.error("Ticket status update failed:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo actualizar el ticket.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const callNextTicket = async (serviceType: TicketServiceType) => {
    setCallingService(serviceType);

    try {
      const response = await fetch("/api/tickets/next", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceType,
          scheduledDate,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        ticket?: ApiTicket;
      };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo llamar el siguiente turno.");
      }

      await refreshTickets(true);
      toast({
        title: "Ticket llamado",
        description: data.ticket
          ? `En curso: ${data.ticket.ticketNumber}`
          : "Se llamo el siguiente ticket.",
      });
    } catch (error) {
      console.error("Call next failed:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo llamar el siguiente ticket.",
        variant: "destructive",
      });
    } finally {
      setCallingService(null);
    }
  };

  const passToCaja = async (ticketId: string) => {
    const actionKey = `${ticketId}:pasar-caja`;
    setBusyAction(actionKey);

    try {
      const response = await fetch(
        `/api/tickets/${encodeURIComponent(ticketId)}/pass-to-caja`,
        {
          method: "POST",
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        cajaTicket?: ApiTicket;
      };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo pasar el ticket a caja.");
      }

      await refreshTickets(true);
      toast({
        title: "Ticket derivado",
        description: data.cajaTicket
          ? `Enviado a caja: ${data.cajaTicket.ticketNumber}`
          : "El ticket se envio a caja.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo pasar a caja.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const createManualTicket = async () => {
    if (!createClientName.trim()) {
      toast({
        title: "Nombre requerido",
        description: "Ingresa un nombre para crear el turno manual.",
        variant: "destructive",
      });
      return;
    }

    setCreatingTicket(true);
    try {
      const response = await fetch("/api/tickets/operator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceType: createServiceType,
          clientName: createClientName.trim(),
          clientNote: createClientNote.trim(),
          scheduledDate,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        ticket?: ApiTicket;
      };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear el turno manual.");
      }

      setCreateClientName("");
      setCreateClientNote("");
      await refreshTickets(true);
      toast({
        title: "Turno creado",
        description: data.ticket
          ? `Nuevo ticket: ${data.ticket.ticketNumber}`
          : "Se creo el turno manual.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo crear el turno.",
        variant: "destructive",
      });
    } finally {
      setCreatingTicket(false);
    }
  };

  return (
    <section className="container mx-auto space-y-5 px-4 py-8 md:px-6">
      <Card className="rounded-3xl border bg-card/85 p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Panel Interno
            </p>
            <h1 className="mt-2 text-3xl font-bold">Gestion de Turnos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Operador: {operatorName}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Fecha</p>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(event) => setScheduledDate(event.target.value)}
                className="w-44"
              />
            </div>
            <Button type="button" variant="outline" onClick={() => refreshTickets(true)}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Actualizar
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border bg-background/70 p-4">
          <p className="text-sm font-semibold">Crear turno manual por estacion</p>
          {creatableServiceTypes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Tu perfil no tiene permisos para crear turnos.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.5fr_2fr_auto]">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Estacion</span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={createServiceType}
                  onChange={(event) =>
                    setCreateServiceType(event.target.value as TicketServiceType)
                  }
                  disabled={creatingTicket}
                >
                  {creatableServiceTypes.map((serviceType) => (
                    <option key={serviceType} value={serviceType}>
                      {TICKET_SERVICE_LABELS[serviceType]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Cliente</span>
                <Input
                  value={createClientName}
                  onChange={(event) => setCreateClientName(event.target.value)}
                  placeholder="Nombre del cliente"
                  maxLength={80}
                  disabled={creatingTicket}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Nota (opcional)</span>
                <Textarea
                  value={createClientNote}
                  onChange={(event) => setCreateClientNote(event.target.value)}
                  placeholder="Detalle breve"
                  className="min-h-10"
                  maxLength={300}
                  disabled={creatingTicket}
                />
              </label>

              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={createManualTicket}
                  disabled={creatingTicket || !createClientName.trim()}
                  className="w-full md:w-auto"
                >
                  {creatingTicket ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    "Crear turno"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {allowedServiceTypes.length === 0 ? (
            <div className="md:col-span-3 rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
              Tu perfil no tiene servicios asignados para operar turnos.
            </div>
          ) : null}

          {allowedServiceTypes.map((serviceType) => {
            const serviceSummary = summary?.byService[serviceType];
            const pending = serviceSummary?.pendiente || 0;
            const called = serviceSummary?.llamado || 0;
            const attended = serviceSummary?.atendido || 0;

            return (
              <div
                key={serviceType}
                className="rounded-2xl border bg-background/70 p-4 transition hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{TICKET_SERVICE_LABELS[serviceType]}</p>
                  <Badge variant="outline">Total: {pending + called + attended}</Badge>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-amber-500/15 p-2">
                    <p className="font-semibold text-amber-700 dark:text-amber-400">{pending}</p>
                    <p className="text-muted-foreground">Pend.</p>
                  </div>
                  <div className="rounded-lg bg-blue-500/15 p-2">
                    <p className="font-semibold text-blue-700 dark:text-blue-400">{called}</p>
                    <p className="text-muted-foreground">Llam.</p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/15 p-2">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {attended}
                    </p>
                    <p className="text-muted-foreground">Atend.</p>
                  </div>
                </div>

                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={() => callNextTicket(serviceType)}
                  disabled={callingService === serviceType || pending === 0}
                >
                  {callingService === serviceType ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <BellRing className="mr-2 h-4 w-4" />
                  )}
                  Llamar siguiente
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="rounded-3xl border bg-card/85 p-5 shadow-lg backdrop-blur-sm md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={statusFilter === status ? "default" : "outline"}
                onClick={() => setStatusFilter(status)}
              >
                {status === "todos" ? "Todos" : TICKET_STATUS_LABELS[status]}
              </Button>
            ))}
          </div>

          <Badge variant="secondary">Registros: {filteredTickets.length}</Badge>
        </div>

        {loading ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando tickets...
          </div>
        ) : null}

        {!loading && filteredTickets.length === 0 ? (
          <div className="mt-5 rounded-xl border p-5 text-sm text-muted-foreground">
            No hay tickets para el filtro seleccionado.
          </div>
        ) : null}

        {!loading && filteredTickets.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Hora</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    className={cn(
                      ticket.status === "llamado" ? "bg-blue-500/5" : "",
                    )}
                  >
                    <TableCell className="font-medium">{ticket.ticketNumber}</TableCell>
                    <TableCell>{TICKET_SERVICE_LABELS[ticket.serviceType]}</TableCell>
                    <TableCell>
                      <p>{ticket.clientName}</p>
                      {ticket.clientNote ? (
                        <p className="text-xs text-muted-foreground">{ticket.clientNote}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatTicketTime(ticket)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusClass(ticket.status)}>
                        {ticket.status === "pendiente" ? (
                          <Clock3 className="mr-1 h-3 w-3" />
                        ) : null}
                        {TICKET_STATUS_LABELS[ticket.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {ticket.status === "pendiente" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => applyStatus(ticket.id, "llamado")}
                            disabled={busyAction === `${ticket.id}:llamado`}
                          >
                            {busyAction === `${ticket.id}:llamado` ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <BellRing className="mr-1 h-3 w-3" />
                            )}
                            Llamar
                          </Button>
                        ) : null}

                        {ticket.status === "llamado" && ticket.serviceType !== "caja" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => passToCaja(ticket.id)}
                            disabled={busyAction === `${ticket.id}:pasar-caja`}
                          >
                            {busyAction === `${ticket.id}:pasar-caja` ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <BellRing className="mr-1 h-3 w-3" />
                            )}
                            Pasar a caja
                          </Button>
                        ) : null}

                        {ticket.status === "llamado" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => applyStatus(ticket.id, "atendido")}
                            disabled={busyAction === `${ticket.id}:atendido`}
                          >
                            {busyAction === `${ticket.id}:atendido` ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCheck className="mr-1 h-3 w-3" />
                            )}
                            Finalizar turno
                          </Button>
                        ) : null}

                        {(ticket.status === "pendiente" || ticket.status === "llamado") ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => applyStatus(ticket.id, "cancelado")}
                            disabled={busyAction === `${ticket.id}:cancelado`}
                          >
                            {busyAction === `${ticket.id}:cancelado` ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="mr-1 h-3 w-3" />
                            )}
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
