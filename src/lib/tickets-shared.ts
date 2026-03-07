export const TICKET_SERVICE_TYPES = ["servicio", "caja", "digitacion"] as const;
export type TicketServiceType = (typeof TICKET_SERVICE_TYPES)[number];

export const TICKET_STATUSES = [
  "pendiente",
  "llamado",
  "atendido",
  "cancelado",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_SERVICE_LABELS: Record<TicketServiceType, string> = {
  servicio: "Servicio",
  caja: "Caja",
  digitacion: "Digitacion",
};

export const TICKET_SERVICE_DISPLAY_PREFIX: Record<TicketServiceType, string> = {
  servicio: "SER",
  caja: "CAJ",
  digitacion: "DIG",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pendiente: "Pendiente",
  llamado: "Llamado",
  atendido: "Atendido",
  cancelado: "Cancelado",
};

export function isTicketServiceType(value: unknown): value is TicketServiceType {
  return (
    typeof value === "string" &&
    (TICKET_SERVICE_TYPES as readonly string[]).includes(value)
  );
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === "string" &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function formatTicketDisplayCode(
  serviceType: TicketServiceType,
  ticketNumber: string,
) {
  const prefix = TICKET_SERVICE_DISPLAY_PREFIX[serviceType];
  const match = typeof ticketNumber === "string" ? ticketNumber.match(/(\d+)(?!.*\d)/) : null;
  const sequence = match ? Number(match[1]) : Number.NaN;

  if (!Number.isFinite(sequence) || sequence <= 0) {
    return `${prefix}-00`;
  }

  const width = sequence >= 100 ? 3 : 2;
  return `${prefix}-${String(Math.floor(sequence)).padStart(width, "0")}`;
}
