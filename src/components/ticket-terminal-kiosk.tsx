"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  FilePenLine,
  Headset,
  Loader2,
  PlusCircle,
  Settings2,
  Ticket,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth/client";
import { canAccessGlobalSettings } from "@/lib/auth/permissions";
import {
  TICKET_SERVICE_LABELS,
  TICKET_SERVICE_TYPES,
  formatTicketDisplayCode,
  type TicketServiceType,
  type TicketStatus,
} from "@/lib/tickets-shared";

type ApiTicket = {
  id: string;
  ticketNumber: string;
  serviceType: TicketServiceType;
  status: TicketStatus;
};

type ApiSummary = {
  byService: Record<TicketServiceType, Record<TicketStatus, number>>;
};

type TicketResponse = {
  ticket: ApiTicket;
  queuePosition: number;
  estimatedWaitMinutes: number;
};

type KioskConfig = {
  autoPrint: boolean;
};

const SERVICE_META: Record<
  TicketServiceType,
  {
    icon: LucideIcon;
    style: string;
  }
> = {
  servicio: {
    icon: Headset,
    style: "from-blue-600 to-cyan-500 text-white",
  },
  caja: {
    icon: Banknote,
    style: "from-emerald-600 to-teal-500 text-white",
  },
  digitacion: {
    icon: FilePenLine,
    style: "from-violet-600 to-indigo-500 text-white",
  },
};

function getTodayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatClock(date: Date) {
  return date.toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const KIOSK_CONFIG_KEY = "ticket_kiosk_config_v1";
const SUCCESS_MODAL_MS = 5000;
const DEFAULT_CONFIG: KioskConfig = {
  autoPrint: false,
};

function buildPrintMarkup(ticketData: TicketResponse) {
  const code = formatTicketDisplayCode(
    ticketData.ticket.serviceType,
    ticketData.ticket.ticketNumber,
  );
  const station = TICKET_SERVICE_LABELS[ticketData.ticket.serviceType];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ticket ${code}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 16px; }
    .wrap { width: 280px; margin: 0 auto; text-align: center; }
    .title { font-size: 14px; margin-bottom: 8px; }
    .code { font-size: 42px; font-weight: 700; letter-spacing: 2px; margin: 12px 0; }
    .meta { font-size: 12px; margin: 4px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="title">Sistema de Turnos</div>
    <div class="meta">Estacion: ${station}</div>
    <div class="code">${code}</div>
    <div class="meta">Ticket interno: ${ticketData.ticket.ticketNumber}</div>
    <div class="meta">Posicion: ${ticketData.queuePosition}</div>
    <div class="meta">Espera aprox: ${ticketData.estimatedWaitMinutes} min</div>
  </div>
  <script>
    window.onload = function () {
      window.print();
      setTimeout(function () { window.close(); }, 200);
    };
  </script>
</body>
</html>`;
}

export function TicketTerminalKiosk() {
  const { toast } = useToast();
  const { data: sessionData } = authClient.useSession();
  const canConfigureTurnos = canAccessGlobalSettings(sessionData?.user);
  const [scheduledDate, setScheduledDate] = useState(getTodayDateInput());
  const [now, setNow] = useState(new Date());
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [submittingService, setSubmittingService] = useState<TicketServiceType | null>(null);
  const [latestTaken, setLatestTaken] = useState<TicketResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<KioskConfig>(DEFAULT_CONFIG);
  const modalCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KIOSK_CONFIG_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<KioskConfig>;
      setConfig({
        autoPrint: Boolean(parsed.autoPrint),
      });
    } catch {
      // ignore invalid config
    }
  }, []);

  const saveConfig = useCallback((next: KioskConfig) => {
    setConfig(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(KIOSK_CONFIG_KEY, JSON.stringify(next));
    }
  }, []);

  const queueSuccessModalClose = useCallback(() => {
    if (modalCloseTimerRef.current !== null) {
      window.clearTimeout(modalCloseTimerRef.current);
    }

    modalCloseTimerRef.current = window.setTimeout(() => {
      setTicketModalOpen(false);
    }, SUCCESS_MODAL_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (modalCloseTimerRef.current !== null) {
        window.clearTimeout(modalCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!canConfigureTurnos && configOpen) {
      setConfigOpen(false);
    }
  }, [canConfigureTurnos, configOpen]);

  const refreshSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const params = new URLSearchParams();
      params.set("scheduledDate", scheduledDate);
      params.set("includeClosed", "false");
      params.set("limit", "10");

      const response = await fetch(`/api/tickets?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) return;

      const data = (await response.json()) as {
        summary?: ApiSummary;
      };

      setSummary(data.summary || null);
    } catch {
      // ignore summary failures in kiosk mode
    } finally {
      setLoadingSummary(false);
    }
  }, [scheduledDate]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    const clockId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    const refreshId = window.setInterval(() => {
      refreshSummary();
    }, 10000);

    return () => {
      window.clearInterval(clockId);
      window.clearInterval(refreshId);
    };
  }, [refreshSummary]);

  const takeTurn = async (serviceType: TicketServiceType) => {
    setSubmittingService(serviceType);
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceType,
          clientName: "Cliente Terminal",
          clientNote: "Turno tomado desde terminal",
          scheduledDate,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as
        | {
            error?: string;
          }
        | TicketResponse;

      if (!response.ok) {
        const message =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "No se pudo tomar el turno.";
        throw new Error(message);
      }

      const taken = data as TicketResponse;
      setLatestTaken(taken);
      setTicketModalOpen(true);
      queueSuccessModalClose();

      if (config.autoPrint && typeof window !== "undefined") {
        const printWindow = window.open("", "_blank", "width=420,height=640");
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(buildPrintMarkup(taken));
          printWindow.document.close();
        } else {
          toast({
            title: "Impresion bloqueada",
            description: "El navegador bloqueo la ventana de impresion.",
            variant: "destructive",
          });
        }
      }

      setOptionsOpen(false);
      await refreshSummary();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo tomar el turno.",
        variant: "destructive",
      });
    } finally {
      setSubmittingService(null);
    }
  };

  const totalPending = useMemo(() => {
    if (!summary) return 0;
    return TICKET_SERVICE_TYPES.reduce((acc, serviceType) => {
      const pending = summary.byService[serviceType]?.pendiente || 0;
      const called = summary.byService[serviceType]?.llamado || 0;
      return acc + pending + called;
    }, 0);
  }, [summary]);

  const latestDisplayCode = latestTaken
    ? formatTicketDisplayCode(
        latestTaken.ticket.serviceType,
        latestTaken.ticket.ticketNumber,
      )
    : "---";

  return (
    <section className="mx-auto flex min-h-screen w-full items-center justify-center px-4 py-8 md:px-6">
      <Card className="w-full max-w-5xl rounded-3xl border bg-card/85 p-6 shadow-xl backdrop-blur-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">
              Terminal de Turnos
            </p>
            <h1 className="mt-2 text-3xl font-bold md:text-5xl">
              Toma tu turno aqui
            </h1>
            <p className="mt-2 text-sm text-muted-foreground md:text-base">
              Presiona el boton grande para tomar turno.
            </p>
          </div>

          <div className="rounded-2xl border bg-background/80 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Hora actual</p>
            <p className="mt-1 text-2xl font-mono font-semibold">{formatClock(now)}</p>
            <p className="text-xs text-muted-foreground">{scheduledDate}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">En cola: {totalPending}</Badge>
          <Badge variant="outline">
            Estado: {loadingSummary ? "Actualizando..." : "En linea"}
          </Badge>
          {canConfigureTurnos ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
              <Settings2 className="mr-1 h-4 w-4" />
              Configuracion
            </Button>
          ) : null}
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            onClick={() => setOptionsOpen(true)}
            className="h-36 w-full max-w-4xl rounded-3xl text-4xl font-bold tracking-wide md:h-44 md:text-6xl"
          >
            <PlusCircle className="mr-4 h-10 w-10 md:h-12 md:w-12" />
            Tomar Turnos
          </Button>
        </div>
      </Card>

      <Dialog open={optionsOpen} onOpenChange={setOptionsOpen}>
        <DialogContent className="h-auto max-h-[78vh] w-[90vw] max-w-4xl p-5">
          <div className="flex h-full flex-col">
            <DialogHeader>
              <DialogTitle className="text-xl">Selecciona una estacion</DialogTitle>
              <DialogDescription>
                Elige el tipo de atencion para generar tu ticket.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-3 grid gap-3 overflow-y-auto md:grid-cols-3">
              {TICKET_SERVICE_TYPES.map((serviceType) => {
                const meta = SERVICE_META[serviceType];
                const Icon = meta.icon;
                const pending = summary?.byService[serviceType]?.pendiente || 0;
                const called = summary?.byService[serviceType]?.llamado || 0;
                const isBusy = submittingService === serviceType;

                return (
                  <button
                  key={serviceType}
                  type="button"
                  onClick={() => takeTurn(serviceType)}
                  disabled={isBusy}
                  className={`rounded-2xl border p-4 text-left bg-gradient-to-br transition-transform duration-150 hover:-translate-y-1 ${meta.style} ${isBusy ? "opacity-80" : ""
                      }`}
                >
                  <div className="flex items-center justify-between gap-2">
                      <Icon className="h-7 w-7" />
                      <Badge className="bg-white/20 text-white">Pend: {pending + called}</Badge>
                    </div>
                    <p className="mt-4 text-2xl font-bold">{TICKET_SERVICE_LABELS[serviceType]}</p>
                    <div className="mt-3 inline-flex items-center rounded-lg bg-white/20 px-3 py-1 text-xs">
                      {isBusy ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Generando...
                        </>
                      ) : (
                        <>
                          <Ticket className="mr-1 h-3 w-3" />
                          Tomar turno
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ticketModalOpen} onOpenChange={setTicketModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Turno asignado</DialogTitle>
            <DialogDescription>
              Este mensaje se cerrara automaticamente en 5 segundos.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-primary/50 bg-primary/10 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Tu turno</p>
            <p className="mt-2 text-5xl font-mono font-bold tracking-wide">
              {latestDisplayCode}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ticket interno: {latestTaken?.ticket.ticketNumber || "---"}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Badge className="bg-primary text-primary-foreground">
                Posicion: {latestTaken?.queuePosition || 0}
              </Badge>
              <Badge variant="outline">
                <Timer className="mr-1 h-3 w-3" />
                Espera aprox: {latestTaken?.estimatedWaitMinutes || 0} min
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canConfigureTurnos ? configOpen : false}
        onOpenChange={(open) => {
          if (!canConfigureTurnos) return;
          setConfigOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configuracion del kiosco</DialogTitle>
            <DialogDescription>
              Aqui puedes activar la impresion automatica del ticket.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div className="space-y-1">
                <Label htmlFor="kiosk-auto-print">Impresion automatica</Label>
                <p className="text-xs text-muted-foreground">
                  Intenta imprimir el ticket al ser generado.
                </p>
              </div>
              <Switch
                id="kiosk-auto-print"
                checked={config.autoPrint}
                onCheckedChange={(checked) =>
                  saveConfig({
                    ...config,
                    autoPrint: checked,
                  })
                }
              />
            </div>

            <p className="text-xs text-muted-foreground">
              El modal del ticket se muestra durante 5 segundos.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfigOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
