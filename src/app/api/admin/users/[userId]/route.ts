import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { authDb } from "@/lib/auth/db";
import {
  ADMIN_ROLE,
  SU_ROLE,
  USER_ROLES,
  canAssignUserGrade,
  canAssignUserRole,
  canManageTargetUser,
  canManageUserPermissions,
  getSessionUser,
  getUserGrade,
  getUserRole,
} from "@/lib/auth/permissions";
import { user as userTable } from "@/lib/auth/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });
  const sessionUser = getSessionUser(session);

  if (!sessionUser || !canManageUserPermissions(sessionUser)) {
    return NextResponse.json(
      { error: "No tienes permisos para actualizar usuarios." },
      { status: 403 },
    );
  }

  const { userId } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "ID de usuario inválido." }, { status: 400 });
  }

  const targetUser = authDb
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      grade: userTable.grade,
      createdAt: userTable.createdAt,
      updatedAt: userTable.updatedAt,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .get();

  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const managerRole = getUserRole(sessionUser);

  if (!canManageTargetUser(sessionUser, targetUser)) {
    return NextResponse.json(
      { error: "No puedes gestionar este usuario por jerarquia de permisos." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    role?: string;
    grade?: number | string;
  } | null;

  const role = typeof body?.role === "string" ? body.role.trim().toLowerCase() : "";
  if (!(USER_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }

  const nextRole = role as (typeof USER_ROLES)[number];

  if (nextRole === SU_ROLE) {
    const existingSuperUser = authDb
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.role, SU_ROLE))
      .get();

    const hasDifferentSuperUser = !!existingSuperUser && existingSuperUser.id !== userId;
    if (hasDifferentSuperUser) {
      return NextResponse.json(
        { error: "Ya existe un usuario Super SU. Solo puede existir uno." },
        { status: 409 },
      );
    }

    const canBootstrapSuperUser = managerRole === ADMIN_ROLE && !existingSuperUser;
    if (managerRole !== SU_ROLE && !canBootstrapSuperUser) {
      return NextResponse.json(
        { error: "Solo un SU puede asignar este rol." },
        { status: 403 },
      );
    }
  }

  if (!canAssignUserRole(sessionUser, nextRole)) {
    return NextResponse.json(
      { error: "No puedes asignar este rol." },
      { status: 403 },
    );
  }

  const parsedGrade =
    typeof body?.grade === "number" ? body.grade : Number(body?.grade ?? Number.NaN);

  if (!Number.isFinite(parsedGrade)) {
    return NextResponse.json({ error: "Grado inválido." }, { status: 400 });
  }

  const grade = Math.max(0, Math.min(100, Math.round(parsedGrade)));

  if (!canAssignUserGrade(sessionUser, grade)) {
    return NextResponse.json(
      { error: "No puedes asignar un grado igual o superior al tuyo." },
      { status: 403 },
    );
  }

  authDb
    .update(userTable)
    .set({
      role: nextRole,
      grade,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId))
    .run();

  const updated = authDb
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      grade: userTable.grade,
      createdAt: userTable.createdAt,
      updatedAt: userTable.updatedAt,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .get();

  if (!updated) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      ...updated,
      role: getUserRole(updated),
      grade: getUserGrade(updated),
    },
  });
}
