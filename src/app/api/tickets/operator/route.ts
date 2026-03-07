import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import {
  canCreateTicketForService,
  canAccessTurnosModule,
  getSessionUser,
} from "@/lib/auth/permissions";
import {
  createTicket,
  getTicketQueuePosition,
  normalizeTicketDate,
} from "@/lib/tickets";

export const runtime = "nodejs";

function getUserId(user: unknown) {
  if (!user || typeof user !== "object") return null;
  const value = (user as Record<string, unknown>).id;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    const sessionUser = getSessionUser(session);

    if (!sessionUser || !canAccessTurnosModule(sessionUser)) {
      return NextResponse.json(
        { error: "No tienes permisos para crear turnos internos." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          serviceType?: unknown;
          clientName?: unknown;
          clientNote?: unknown;
          scheduledDate?: unknown;
          scheduledTime?: unknown;
        }
      | null;

    const serviceType = body?.serviceType;
    if (!canCreateTicketForService(sessionUser, serviceType)) {
      return NextResponse.json(
        { error: "No tienes permisos para crear turnos en esa estacion." },
        { status: 403 },
      );
    }

    const ticket = createTicket(
      {
        serviceType,
        clientName: body?.clientName,
        clientNote: body?.clientNote,
        scheduledDate: normalizeTicketDate(body?.scheduledDate),
        scheduledTime: body?.scheduledTime,
      },
      getUserId(sessionUser),
    );

    const queuePosition = getTicketQueuePosition(ticket.id) || 1;
    return NextResponse.json(
      {
        success: true,
        ticket,
        queuePosition,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo crear el ticket.";
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
