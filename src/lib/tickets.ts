import { randomUUID } from "crypto";
import { getDb, runInTransaction } from "@/lib/db";
import {
  TICKET_SERVICE_TYPES,
  TICKET_STATUSES,
  isTicketServiceType,
  isTicketStatus,
  type TicketServiceType,
  type TicketStatus,
} from "@/lib/tickets-shared";

type SQLiteRunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

type SQLiteStatement = {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
  run(...params: unknown[]): SQLiteRunResult;
};

type SQLiteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
};

const SERVICE_PREFIX: Record<TicketServiceType, string> = {
  servicio: "SRV",
  caja: "CAJ",
  digitacion: "DIG",
};

declare global {
  var __ticketsSchemaReady: boolean | undefined;
}

export type TicketRecord = {
  id: string;
  ticketNumber: string;
  serviceType: TicketServiceType;
  status: TicketStatus;
  clientName: string;
  clientNote: string | null;
  scheduledDate: string;
  scheduledTime: string | null;
  createdByUserId: string | null;
  calledByUserId: string | null;
  attendedByUserId: string | null;
  calledAt: number | null;
  attendedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type CreateTicketInput = {
  serviceType: unknown;
  clientName: unknown;
  clientNote?: unknown;
  scheduledDate?: unknown;
  scheduledTime?: unknown;
};

export type ListTicketsOptions = {
  scheduledDate?: unknown;
  serviceType?: unknown;
  status?: unknown;
  includeClosed?: boolean;
  limit?: unknown;
};

export type TicketSummary = {
  scheduledDate: string;
  total: number;
  byStatus: Record<TicketStatus, number>;
  byService: Record<TicketServiceType, Record<TicketStatus, number>>;
};

export type PassToCajaResult = {
  sourceTicket: TicketRecord;
  cajaTicket: TicketRecord;
};

function now() {
  return Date.now();
}

function toSafeInt(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "bigint") {
    const asNumber = Number(value.toString());
    if (Number.isFinite(asNumber)) {
      return Math.max(0, Math.floor(asNumber));
    }
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return 0;
}

function normalizeText(value: unknown, maxLen: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLen);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayTicketDate() {
  return formatLocalDate(new Date());
}

export function normalizeTicketDate(value: unknown) {
  if (typeof value !== "string") return getTodayTicketDate();
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return getTodayTicketDate();
  return normalized;
}

function normalizeTicketTime(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(normalized)) return null;
  return normalized;
}

function normalizeTicketServiceType(value: unknown): TicketServiceType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isTicketServiceType(normalized) ? normalized : null;
}

function normalizeTicketStatus(value: unknown): TicketStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isTicketStatus(normalized) ? normalized : null;
}

function normalizeTicketId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeActorUserId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function sanitizeLimit(rawLimit: unknown, fallback: number, max: number) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) return fallback;
  const floored = Math.floor(parsed);
  if (floored <= 0) return fallback;
  return Math.min(floored, max);
}

function ensureTicketsSchema(db: SQLiteDatabase) {
  if (globalThis.__ticketsSchemaReady) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL UNIQUE,
      service_type TEXT NOT NULL,
      status TEXT NOT NULL,
      client_name TEXT NOT NULL,
      client_note TEXT,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT,
      created_by_user_id TEXT,
      called_by_user_id TEXT,
      attended_by_user_id TEXT,
      called_at INTEGER,
      attended_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_schedule
    ON tickets(scheduled_date, service_type, status, created_at);

    CREATE INDEX IF NOT EXISTS idx_tickets_status
    ON tickets(status, scheduled_date, created_at);
  `);

  globalThis.__ticketsSchemaReady = true;
}

function getTicketsDb() {
  const db = getDb() as unknown as SQLiteDatabase;
  ensureTicketsSchema(db);
  return db;
}

function emptyStatusMap(): Record<TicketStatus, number> {
  return {
    pendiente: 0,
    llamado: 0,
    atendido: 0,
    cancelado: 0,
  };
}

function mapTicketRow(row: Record<string, unknown>): TicketRecord {
  const serviceType = normalizeTicketServiceType(row.service_type) || "servicio";
  const status = normalizeTicketStatus(row.status) || "pendiente";

  return {
    id: String(row.id || ""),
    ticketNumber: String(row.ticket_number || ""),
    serviceType,
    status,
    clientName: String(row.client_name || ""),
    clientNote: typeof row.client_note === "string" && row.client_note.trim() ? row.client_note : null,
    scheduledDate: String(row.scheduled_date || getTodayTicketDate()),
    scheduledTime:
      typeof row.scheduled_time === "string" && row.scheduled_time.trim()
        ? row.scheduled_time
        : null,
    createdByUserId:
      typeof row.created_by_user_id === "string" && row.created_by_user_id.trim()
        ? row.created_by_user_id
        : null,
    calledByUserId:
      typeof row.called_by_user_id === "string" && row.called_by_user_id.trim()
        ? row.called_by_user_id
        : null,
    attendedByUserId:
      typeof row.attended_by_user_id === "string" && row.attended_by_user_id.trim()
        ? row.attended_by_user_id
        : null,
    calledAt: row.called_at == null ? null : toSafeInt(row.called_at),
    attendedAt: row.attended_at == null ? null : toSafeInt(row.attended_at),
    createdAt: toSafeInt(row.created_at),
    updatedAt: toSafeInt(row.updated_at),
  };
}

function buildTicketNumber(serviceType: TicketServiceType, scheduledDate: string, sequence: number) {
  const prefix = SERVICE_PREFIX[serviceType];
  const datePart = scheduledDate.replace(/-/g, "");
  const sequencePart = String(Math.max(1, sequence)).padStart(3, "0");
  return `${prefix}-${datePart}-${sequencePart}`;
}

export function getTicketById(ticketIdRaw: unknown) {
  const ticketId = normalizeTicketId(ticketIdRaw);
  if (!ticketId) return null;

  const db = getTicketsDb();
  const row = db
    .prepare(
      `SELECT id, ticket_number, service_type, status, client_name, client_note, scheduled_date,
              scheduled_time, created_by_user_id, called_by_user_id, attended_by_user_id,
              called_at, attended_at, created_at, updated_at
       FROM tickets
       WHERE id = ?`
    )
    .get(ticketId);

  if (!row) return null;
  return mapTicketRow(row);
}

export function listTickets(options: ListTicketsOptions = {}) {
  const db = getTicketsDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.scheduledDate !== undefined && options.scheduledDate !== null) {
    clauses.push("scheduled_date = ?");
    params.push(normalizeTicketDate(options.scheduledDate));
  }

  const serviceType = normalizeTicketServiceType(options.serviceType);
  if (serviceType) {
    clauses.push("service_type = ?");
    params.push(serviceType);
  }

  const status = normalizeTicketStatus(options.status);
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  } else if (options.includeClosed === false) {
    clauses.push("status <> 'cancelado'");
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = sanitizeLimit(options.limit, 200, 1000);

  const rows = db
    .prepare(
      `SELECT id, ticket_number, service_type, status, client_name, client_note, scheduled_date,
              scheduled_time, created_by_user_id, called_by_user_id, attended_by_user_id,
              called_at, attended_at, created_at, updated_at
       FROM tickets
       ${whereSql}
       ORDER BY
         CASE status
           WHEN 'llamado' THEN 0
           WHEN 'pendiente' THEN 1
           WHEN 'atendido' THEN 2
           WHEN 'cancelado' THEN 3
           ELSE 4
         END,
         created_at ASC
       LIMIT ?`
    )
    .all(...params, limit);

  return rows.map(mapTicketRow);
}

export function createTicket(input: CreateTicketInput, createdByUserIdRaw?: unknown) {
  const serviceType = normalizeTicketServiceType(input.serviceType);
  if (!serviceType) {
    throw new Error("El tipo de servicio es invalido.");
  }

  const clientName = normalizeText(input.clientName, 80);
  if (!clientName) {
    throw new Error("El nombre del cliente es obligatorio.");
  }

  const clientNote = normalizeText(input.clientNote, 300);
  const scheduledDate = normalizeTicketDate(input.scheduledDate);
  const scheduledTime = normalizeTicketTime(input.scheduledTime);
  const createdByUserId = normalizeActorUserId(createdByUserIdRaw);
  const db = getTicketsDb();
  const createdAt = now();
  const ticketId = randomUUID();
  let ticketNumber = "";

  runInTransaction(() => {
    const countRow = db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM tickets
         WHERE scheduled_date = ?
           AND service_type = ?`
      )
      .get(scheduledDate, serviceType);

    let sequence = toSafeInt(countRow?.total) + 1;
    ticketNumber = buildTicketNumber(serviceType, scheduledDate, sequence);

    while (
      db
        .prepare("SELECT 1 AS present FROM tickets WHERE ticket_number = ? LIMIT 1")
        .get(ticketNumber)?.present
    ) {
      sequence += 1;
      ticketNumber = buildTicketNumber(serviceType, scheduledDate, sequence);
    }

    db.prepare(
      `INSERT INTO tickets(
        id, ticket_number, service_type, status, client_name, client_note,
        scheduled_date, scheduled_time, created_by_user_id, created_at, updated_at
      )
      VALUES(?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ticketId,
      ticketNumber,
      serviceType,
      clientName,
      clientNote,
      scheduledDate,
      scheduledTime,
      createdByUserId,
      createdAt,
      createdAt,
    );
  });

  const ticket = getTicketById(ticketId);
  if (!ticket) {
    throw new Error("No se pudo crear el ticket.");
  }

  return ticket;
}

function getAllowedTransitions(status: TicketStatus) {
  const transitionMap: Record<TicketStatus, TicketStatus[]> = {
    pendiente: ["llamado", "atendido", "cancelado"],
    llamado: ["atendido", "cancelado"],
    atendido: [],
    cancelado: [],
  };

  return transitionMap[status];
}

export function updateTicketStatus(
  ticketIdRaw: unknown,
  nextStatusRaw: unknown,
  actorUserIdRaw?: unknown
) {
  const ticketId = normalizeTicketId(ticketIdRaw);
  if (!ticketId) {
    throw new Error("El ticket es invalido.");
  }

  const nextStatus = normalizeTicketStatus(nextStatusRaw);
  if (!nextStatus) {
    throw new Error("El estado es invalido.");
  }

  const existing = getTicketById(ticketId);
  if (!existing) return null;
  if (existing.status === nextStatus) return existing;

  const allowed = getAllowedTransitions(existing.status);
  if (!allowed.includes(nextStatus)) {
    throw new Error("No se permite esta transicion de estado.");
  }

  const actorUserId = normalizeActorUserId(actorUserIdRaw);
  const db = getTicketsDb();
  const timestamp = now();
  const setClauses = ["status = ?", "updated_at = ?"];
  const params: unknown[] = [nextStatus, timestamp];

  if (nextStatus === "llamado") {
    setClauses.push("called_at = ?");
    params.push(timestamp);

    if (actorUserId) {
      setClauses.push("called_by_user_id = ?");
      params.push(actorUserId);
    }
  }

  if (nextStatus === "atendido") {
    if (!existing.calledAt) {
      setClauses.push("called_at = ?");
      params.push(timestamp);
    }

    setClauses.push("attended_at = ?");
    params.push(timestamp);

    if (actorUserId) {
      if (!existing.calledByUserId) {
        setClauses.push("called_by_user_id = ?");
        params.push(actorUserId);
      }

      setClauses.push("attended_by_user_id = ?");
      params.push(actorUserId);
    }
  }

  db.prepare(`UPDATE tickets SET ${setClauses.join(", ")} WHERE id = ?`).run(
    ...params,
    ticketId,
  );

  return getTicketById(ticketId);
}

export function passTicketToCaja(
  ticketIdRaw: unknown,
  actorUserIdRaw?: unknown,
): PassToCajaResult {
  const source = getTicketById(ticketIdRaw);
  if (!source) {
    throw new Error("Ticket no encontrado.");
  }

  if (source.serviceType === "caja") {
    throw new Error("Este ticket ya pertenece a caja.");
  }

  if (source.status !== "llamado") {
    throw new Error("Solo se puede pasar a caja desde un ticket llamado.");
  }

  const sourceTicket = updateTicketStatus(source.id, "atendido", actorUserIdRaw);
  if (!sourceTicket) {
    throw new Error("No se pudo finalizar el ticket origen.");
  }

  const cajaTicket = createTicket(
    {
      serviceType: "caja",
      clientName: source.clientName,
      clientNote: `Derivado de ${source.ticketNumber} (${source.serviceType}).`,
      scheduledDate: source.scheduledDate,
    },
    actorUserIdRaw,
  );

  return {
    sourceTicket,
    cajaTicket,
  };
}

export function callNextPendingTicket(
  serviceTypeRaw: unknown,
  scheduledDateRaw?: unknown,
  actorUserIdRaw?: unknown
) {
  const serviceType = normalizeTicketServiceType(serviceTypeRaw);
  if (!serviceType) {
    throw new Error("El tipo de servicio es invalido.");
  }

  const scheduledDate = normalizeTicketDate(scheduledDateRaw);
  const db = getTicketsDb();
  let nextTicketId: string | null = null;

  runInTransaction(() => {
    const row = db
      .prepare(
        `SELECT id
         FROM tickets
         WHERE scheduled_date = ?
           AND service_type = ?
           AND status = 'pendiente'
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get(scheduledDate, serviceType);

    if (!row?.id) return;

    nextTicketId = String(row.id);
    updateTicketStatus(nextTicketId, "llamado", actorUserIdRaw);
  });

  if (!nextTicketId) return null;
  return getTicketById(nextTicketId);
}

export function getTicketQueuePosition(ticketIdRaw: unknown) {
  const ticket = getTicketById(ticketIdRaw);
  if (!ticket) return null;

  const db = getTicketsDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM tickets
       WHERE scheduled_date = ?
         AND service_type = ?
         AND status IN ('pendiente', 'llamado')
         AND created_at <= ?`
    )
    .get(ticket.scheduledDate, ticket.serviceType, ticket.createdAt);

  return toSafeInt(row?.total);
}

export function getTicketSummary(scheduledDateRaw?: unknown): TicketSummary {
  const scheduledDate = normalizeTicketDate(scheduledDateRaw);
  const db = getTicketsDb();
  const rows = db
    .prepare(
      `SELECT service_type, status, COUNT(*) AS total
       FROM tickets
       WHERE scheduled_date = ?
       GROUP BY service_type, status`
    )
    .all(scheduledDate);

  const byStatus = emptyStatusMap();
  const byService = Object.fromEntries(
    TICKET_SERVICE_TYPES.map((serviceType) => [serviceType, emptyStatusMap()]),
  ) as Record<TicketServiceType, Record<TicketStatus, number>>;

  rows.forEach((row) => {
    const serviceType = normalizeTicketServiceType(row.service_type);
    const status = normalizeTicketStatus(row.status);
    if (!serviceType || !status) return;
    const total = toSafeInt(row.total);

    byStatus[status] += total;
    byService[serviceType][status] += total;
  });

  const total = TICKET_STATUSES.reduce((sum, status) => sum + byStatus[status], 0);

  return {
    scheduledDate,
    total,
    byStatus,
    byService,
  };
}
