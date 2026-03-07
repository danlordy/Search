import { isTicketServiceType, type TicketServiceType } from "@/lib/tickets-shared";

export const USER_ROLES = [
  "admin",
  "manager",
  "editor",
  "viewer",
  "servicio",
  "caja",
  "digitacion",
  "user",
] as const;

export const REGISTERABLE_USER_ROLES = [
  "servicio",
  "caja",
  "digitacion",
  "admin",
  "user",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type RegisterableUserRole = (typeof REGISTERABLE_USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "user";
export const DEFAULT_USER_GRADE = 1;
export const ADMIN_ROLE: UserRole = "admin";
export const ADMIN_GRADE = 100;
export const GLOBAL_SETTINGS_MIN_GRADE = 70;
export const USER_MANAGEMENT_MIN_GRADE = 90;

const ROLE_DEFAULT_GRADE: Record<UserRole, number> = {
  admin: ADMIN_GRADE,
  manager: 80,
  editor: 55,
  viewer: 20,
  servicio: 45,
  caja: 50,
  digitacion: 40,
  user: DEFAULT_USER_GRADE,
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  manager: "Manager",
  editor: "Editor",
  viewer: "Viewer",
  servicio: "Servicio al cliente",
  caja: "Caja",
  digitacion: "Digitacion",
  user: "Usuario",
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function normalizeRoleAlias(value: string) {
  const normalized = value.toLowerCase().trim();
  if (normalized === "administrador") return ADMIN_ROLE;
  if (normalized === "ser") return "servicio";
  if (normalized === "dig") return "digitacion";
  if (normalized === "servicio_al_cliente") return "servicio";
  if (normalized === "servicio-cliente") return "servicio";
  if (normalized === "servicio cliente") return "servicio";
  return normalized;
}

export function normalizeUserRoleInput(value: unknown): UserRole {
  if (typeof value !== "string") return DEFAULT_USER_ROLE;
  const normalized = normalizeRoleAlias(value);

  if ((USER_ROLES as readonly string[]).includes(normalized)) {
    return normalized as UserRole;
  }

  return DEFAULT_USER_ROLE;
}

export function normalizeRegisterableRoleInput(value: unknown): RegisterableUserRole {
  const normalized = normalizeRoleAlias(typeof value === "string" ? value : "");

  if ((REGISTERABLE_USER_ROLES as readonly string[]).includes(normalized)) {
    return normalized as RegisterableUserRole;
  }

  return "user";
}

export function getDefaultGradeForRole(roleRaw: unknown): number {
  const role = normalizeUserRoleInput(roleRaw);
  return ROLE_DEFAULT_GRADE[role] ?? DEFAULT_USER_GRADE;
}

export function getSessionUser(session: unknown): UnknownRecord | null {
  if (!isRecord(session)) return null;
  const user = session.user;
  if (!isRecord(user)) return null;
  return user;
}

export function getUserRole(user: unknown): UserRole {
  if (!isRecord(user)) return DEFAULT_USER_ROLE;
  return normalizeUserRoleInput(user.role);
}

export function getUserGrade(user: unknown): number {
  if (!isRecord(user)) return DEFAULT_USER_GRADE;
  const raw = user.grade;
  const parsed = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(parsed)) return getDefaultGradeForRole(getUserRole(user));
  const clamped = Math.max(0, Math.min(100, Math.round(parsed)));
  return clamped;
}

export function canAccessGlobalSettings(user: unknown): boolean {
  const role = getUserRole(user);
  const grade = getUserGrade(user);
  return role === ADMIN_ROLE || grade >= GLOBAL_SETTINGS_MIN_GRADE;
}

export function canManageUserPermissions(user: unknown): boolean {
  const role = getUserRole(user);
  const grade = getUserGrade(user);
  return role === ADMIN_ROLE || grade >= USER_MANAGEMENT_MIN_GRADE;
}

export function canAccessTurnosModule(user: unknown): boolean {
  const role = getUserRole(user);
  return (
    role === ADMIN_ROLE ||
    role === "manager" ||
    role === "servicio" ||
    role === "caja" ||
    role === "digitacion" ||
    canAccessGlobalSettings(user)
  );
}

export function canOperateTicketService(
  user: unknown,
  serviceTypeRaw: unknown,
): boolean {
  const role = getUserRole(user);
  if (canCreateTicketsForAnyStation(user)) return true;
  if (!isTicketServiceType(serviceTypeRaw)) return false;

  const serviceType = serviceTypeRaw as TicketServiceType;
  return role === serviceType;
}

export function canCreateTicketsForAnyStation(user: unknown): boolean {
  const role = getUserRole(user);
  return (
    role === ADMIN_ROLE ||
    role === "manager" ||
    canAccessGlobalSettings(user)
  );
}

export function canCreateTicketForService(
  user: unknown,
  serviceTypeRaw: unknown,
): boolean {
  if (canCreateTicketsForAnyStation(user)) return true;
  if (!isTicketServiceType(serviceTypeRaw)) return false;

  const role = getUserRole(user);
  const serviceType = serviceTypeRaw as TicketServiceType;
  return role === serviceType;
}

export function getDefaultLandingPath(user: unknown): string {
  const role = getUserRole(user);

  if (role === ADMIN_ROLE || canAccessGlobalSettings(user)) {
    return "/dashboard";
  }

  if (canAccessTurnosModule(user)) {
    return "/turnos";
  }

  return "/clientes";
}

export function isAdminUser(user: unknown): boolean {
  return getUserRole(user) === ADMIN_ROLE;
}

// Admin users are protected: nobody can modify an account already marked as admin.
export function isProtectedAdminTarget(targetUser: unknown): boolean {
  return getUserRole(targetUser) === ADMIN_ROLE;
}

// Non-admin managers can only operate over users with lower grade.
export function canManageTargetUser(managerUser: unknown, targetUser: unknown): boolean {
  const managerRole = getUserRole(managerUser);
  if (managerRole === ADMIN_ROLE) {
    return !isProtectedAdminTarget(targetUser);
  }

  if (isProtectedAdminTarget(targetUser)) {
    return false;
  }

  const managerGrade = getUserGrade(managerUser);
  const targetGrade = getUserGrade(targetUser);
  return managerGrade > targetGrade;
}

// Non-admin managers cannot assign admin role.
export function canAssignUserRole(managerUser: unknown, nextRole: UserRole): boolean {
  const managerRole = getUserRole(managerUser);
  if (managerRole === ADMIN_ROLE) return true;
  return nextRole !== ADMIN_ROLE;
}

// Non-admin managers cannot assign a grade equal or above their own grade.
export function canAssignUserGrade(managerUser: unknown, nextGrade: number): boolean {
  const managerRole = getUserRole(managerUser);
  if (managerRole === ADMIN_ROLE) return true;
  return nextGrade < getUserGrade(managerUser);
}
