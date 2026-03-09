import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  GLOBAL_SETTINGS_MIN_GRADE,
  USER_MANAGEMENT_MIN_GRADE,
  USER_ROLES,
  type UserRole,
} from "@/lib/auth/permissions";

type RoleGuide = {
  summary: string;
  gradeRule: string;
};

const ROLE_GUIDE: Record<UserRole, RoleGuide> = {
  su: {
    summary: "Super usuario con maxima jerarquia.",
    gradeRule: "Puede administrar todo el sistema, incluyendo cuentas admin.",
  },
  admin: {
    summary: "Control total del sistema.",
    gradeRule: "Administra el sistema, pero no puede modificar cuentas SU.",
  },
  manager: {
    summary: "Rol organizativo sin privilegios especiales por si solo.",
    gradeRule: "Sus permisos reales dependen del grado asignado.",
  },
  editor: {
    summary: "Rol de trabajo interno sin privilegios especiales por si solo.",
    gradeRule: "Sus permisos reales dependen del grado asignado.",
  },
  viewer: {
    summary: "Rol de consulta sin privilegios especiales por si solo.",
    gradeRule: "Sus permisos reales dependen del grado asignado.",
  },
  servicio: {
    summary: "Operador de servicio al cliente.",
    gradeRule: "Puede gestionar tickets del modulo Servicio.",
  },
  caja: {
    summary: "Operador de caja.",
    gradeRule: "Puede gestionar tickets del modulo Caja.",
  },
  digitacion: {
    summary: "Operador de digitacion.",
    gradeRule: "Puede gestionar tickets del modulo Digitacion.",
  },
  user: {
    summary: "Rol base para usuarios estandar.",
    gradeRule: "Sus permisos reales dependen del grado asignado.",
  },
};

const GRADE_GUIDE = [
  {
    range: `0-${GLOBAL_SETTINGS_MIN_GRADE - 1}`,
    can: "Uso normal del sistema sin permisos administrativos.",
  },
  {
    range: `${GLOBAL_SETTINGS_MIN_GRADE}-${USER_MANAGEMENT_MIN_GRADE - 1}`,
    can: "Puede editar configuracion global e indexar documentos.",
  },
  {
    range: `${USER_MANAGEMENT_MIN_GRADE}-100`,
    can: "Puede editar configuracion global y gestionar usuarios.",
  },
] as const;

function formatRole(role: UserRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AdminPermissionsGuide() {
  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Guia de Roles y Grados</h2>
          <p className="text-sm text-muted-foreground">
            Esta guia se muestra solo en el dashboard de administracion.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Que hace cada rol</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {USER_ROLES.map((role) => (
            <div key={role} className="rounded-lg border p-3">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={role === "su" || role === "admin" ? "default" : "secondary"}>
                  {formatRole(role)}
                </Badge>
              </div>
              <p className="text-sm">{ROLE_GUIDE[role].summary}</p>
              <p className="text-xs text-muted-foreground">{ROLE_GUIDE[role].gradeRule}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Que puede hacer cada grado (0-100)</h3>
        <div className="space-y-2">
          {GRADE_GUIDE.map((level) => (
            <div key={level.range} className="rounded-lg border p-3">
              <p className="text-sm font-medium">Grado {level.range}</p>
              <p className="text-sm text-muted-foreground">{level.can}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Jerarquia: SU esta por encima de admin. Un gestor sin rol administrativo
          solo puede editar usuarios con grado menor al suyo.
        </p>
        <p className="text-xs text-muted-foreground">
          Roles protegidos: solo SU puede modificar cuentas admin. Las cuentas SU
          no se pueden modificar desde esta gestion.
        </p>
        <p className="text-xs text-muted-foreground">
          Nota: los roles SU y admin mantienen acceso completo aunque su grado no alcance
          los umbrales de {GLOBAL_SETTINGS_MIN_GRADE} o {USER_MANAGEMENT_MIN_GRADE}.
        </p>
      </div>
    </Card>
  );
}
