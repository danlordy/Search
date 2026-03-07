import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { canOperateTicketService, getSessionUser } from "@/lib/auth/permissions";
import { getTicketById, passTicketToCaja } from "@/lib/tickets";

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

export async function POST(request: NextRequest, context: RouteContext) {
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

    const result = passTicketToCaja(ticketId, getUserId(sessionUser));

    return NextResponse.json({
      success: true,
      sourceTicket: result.sourceTicket,
      cajaTicket: result.cajaTicket,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo pasar el ticket a caja.";

    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
