import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { canOperateTicketService, getSessionUser } from "@/lib/auth/permissions";
import { callNextPendingTicket } from "@/lib/tickets";

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

    if (!sessionUser) {
      return NextResponse.json(
        { error: "Debes iniciar sesion para gestionar turnos." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          serviceType?: unknown;
          scheduledDate?: unknown;
        }
      | null;

    if (!canOperateTicketService(sessionUser, body?.serviceType)) {
      return NextResponse.json(
        { error: "No tienes permisos para operar este servicio." },
        { status: 403 },
      );
    }

    const ticket = callNextPendingTicket(
      body?.serviceType,
      body?.scheduledDate,
      getUserId(sessionUser),
    );

    if (!ticket) {
      return NextResponse.json(
        { error: "No hay tickets pendientes para este servicio." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo llamar el siguiente ticket.";

    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
