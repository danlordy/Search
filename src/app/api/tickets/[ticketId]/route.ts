import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { canOperateTicketService, getSessionUser } from "@/lib/auth/permissions";
import { getTicketById, updateTicketStatus } from "@/lib/tickets";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

function getUserId(user: unknown) {
  if (!user || typeof user !== "object") return null;
  const value = (user as Record<string, unknown>).id;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    const sessionUser = getSessionUser(session);

    if (!sessionUser) {
      return NextResponse.json(
        { error: "Debes iniciar sesion para gestionar turnos." },
        { status: 401 },
      );
    }

    const { ticketId } = await context.params;
    const existing = getTicketById(ticketId);
    if (!existing) {
      return NextResponse.json(
        { error: "Ticket no encontrado." },
        { status: 404 },
      );
    }

    if (!canOperateTicketService(sessionUser, existing.serviceType)) {
      return NextResponse.json(
        { error: "No tienes permisos para operar este ticket." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          status?: unknown;
        }
      | null;

    const updated = updateTicketStatus(
      ticketId,
      body?.status,
      getUserId(sessionUser),
    );

    if (!updated) {
      return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      ticket: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo actualizar el ticket.";
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
