import { isTicketServiceType, type TicketServiceType } from "@/lib/tickets-shared";

export const USER_ROLES = [
  "su",
  "admin",
  "manager",
  "editor",
  "viewer",
  "servicio",
  "caja",
  "digitacion",
  "user",
] as const;

export const REGISTERABLE_USER_ROLES = ["user"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type RegisterableUserRole = (typeof REGISTERABLE_USER_ROLES)[number];

export const SU_ROLE: UserRole = "su";
export const SU_GRADE = 100;
export const DEFAULT_USER_ROLE: UserRole = "user";
export const DEFAULT_USER_GRADE = 1;
export const ADMIN_ROLE: UserRole = "admin";
export const ADMIN_GRADE = 100;
export const GLOBAL_SETTINGS_MIN_GRADE = 70;
export const USER_MANAGEMENT_MIN_GRADE = 90;

const ROLE_DEFAULT_GRADE: Record<UserRole, number> = {
  su: SU_GRADE,
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
  su: "Super SU",
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
  if (normalized === "su") return SU_ROLE;
  if (normalized === "super") return SU_ROLE;
  if (normalized === "superuser") return SU_ROLE;
  if (normalized === "super user") return SU_ROLE;
  if (normalized === "superusuario") return SU_ROLE;
  if (normalized === "super usuario") return SU_ROLE;
  if (normalized === "super_su") return SU_ROLE;
  if (normalized === "super-su") return SU_ROLE;
  if (normalized === "super su") return SU_ROLE;
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
  if (normalized === DEFAULT_USER_ROLE) return "user";
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

export function hasAdminPrivileges(user: unknown): boolean {
  const role = getUserRole(user);
  return role === SU_ROLE || role === ADMIN_ROLE;
}

export function canAccessGlobalSettings(user: unknown): boolean {
  const role = getUserRole(user);
  const grade = getUserGrade(user);
  return role === SU_ROLE || role === ADMIN_ROLE || grade >= GLOBAL_SETTINGS_MIN_GRADE;
}

export function canManageUserPermissions(user: unknown): boolean {
  const role = getUserRole(user);
  const grade = getUserGrade(user);
  return role === SU_ROLE || role === ADMIN_ROLE || grade >= USER_MANAGEMENT_MIN_GRADE;
}

export function canAccessTurnosModule(user: unknown): boolean {
  const role = getUserRole(user);
  return (
    role === SU_ROLE ||
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
    role === SU_ROLE ||
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
  if (hasAdminPrivileges(user) || canAccessGlobalSettings(user)) {
    return "/dashboard";
  }

  if (canAccessTurnosModule(user)) {
    return "/turnos";
  }

  return "/clientes";
}

export function isAdminUser(user: unknown): boolean {
  return hasAdminPrivileges(user);
}

// Super users are protected: only SU can manage other admin-level accounts.
export function isProtectedAdminTarget(targetUser: unknown): boolean {
  return getUserRole(targetUser) === SU_ROLE;
}

// Hierarchy: SU > admin > grade-based managers.
export function canManageTargetUser(managerUser: unknown, targetUser: unknown): boolean {
  const managerRole = getUserRole(managerUser);
  const targetRole = getUserRole(targetUser);

  if (managerRole === SU_ROLE) {
    return targetRole !== SU_ROLE;
  }

  if (targetRole === SU_ROLE) {
    return false;
  }

  if (managerRole === ADMIN_ROLE) {
    return targetRole !== ADMIN_ROLE;
  }

  if (targetRole === ADMIN_ROLE) {
    return false;
  }

  const managerGrade = getUserGrade(managerUser);
  const targetGrade = getUserGrade(targetUser);
  return managerGrade > targetGrade;
}

// SU/admin can assign any role. Other managers cannot assign admin-level roles.
export function canAssignUserRole(managerUser: unknown, nextRole: UserRole): boolean {
  const managerRole = getUserRole(managerUser);
  if (managerRole === SU_ROLE) return true;
  if (managerRole === ADMIN_ROLE) return true;
  return nextRole !== ADMIN_ROLE && nextRole !== SU_ROLE;
}

// SU/admin can assign any grade. Others stay below their own grade.
export function canAssignUserGrade(managerUser: unknown, nextGrade: number): boolean {
  const managerRole = getUserRole(managerUser);
  if (managerRole === SU_ROLE || managerRole === ADMIN_ROLE) return true;
  return nextGrade < getUserGrade(managerUser);
}
