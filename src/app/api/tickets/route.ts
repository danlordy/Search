import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { getSessionUser } from "@/lib/auth/permissions";
import {
  createTicket,
  getTicketQueuePosition,
  getTicketSummary,
  getTodayTicketDate,
  listTickets,
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

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const scheduledDate = normalizeTicketDate(
      params.get("scheduledDate") || getTodayTicketDate(),
    );
    const serviceType = params.get("serviceType");
    const status = params.get("status");
    const includeClosedRaw = params.get("includeClosed");
    const includeClosed = includeClosedRaw === "1" || includeClosedRaw === "true";
    const limit = params.get("limit");

    const tickets = listTickets({
      scheduledDate,
      serviceType,
      status,
      includeClosed,
      limit,
    });

    const summary = getTicketSummary(scheduledDate);

    return NextResponse.json({
      success: true,
      scheduledDate,
      tickets,
      count: tickets.length,
      summary,
    });
  } catch (error) {
    console.error("Tickets read error:", error);
    return NextResponse.json(
      {
        error: "No se pudieron cargar los tickets.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    const sessionUser = getSessionUser(session);
    const userId = getUserId(sessionUser);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "El cuerpo de la solicitud es invalido." },
        { status: 400 },
      );
    }

    const ticket = createTicket(
      {
        serviceType: body.serviceType,
        clientName: body.clientName,
        clientNote: body.clientNote,
        scheduledDate: body.scheduledDate,
        scheduledTime: body.scheduledTime,
      },
      userId,
    );

    const queuePosition = getTicketQueuePosition(ticket.id) || 1;
    const estimatedWaitMinutes = Math.max(0, queuePosition - 1) * 6;

    return NextResponse.json(
      {
        success: true,
        ticket,
        queuePosition,
        estimatedWaitMinutes,
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo agendar el ticket.";
    return NextResponse.json(
      { error: message },
      { status: 400 },
    );
  }
}
