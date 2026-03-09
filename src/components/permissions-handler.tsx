"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowBigLeft, ArrowBigRight, Loader2, Shield } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getDefaultGradeForRole,
  USER_ROLE_LABELS,
  type UserRole,
} from "@/lib/auth/permissions";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  grade: number;
};

const PERMISSION_FLOW: UserRole[] = [
  "user",
  "digitacion",
  "servicio",
  "caja",
  "viewer",
  "editor",
  "manager",
  "admin",
  "su",
];

function clampPermissionIndex(index: number) {
  return Math.max(0, Math.min(PERMISSION_FLOW.length - 1, index));
}

export function PermissionsHandler() {
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmPrevOpen, setConfirmPrevOpen] = useState(false);

  const selectedUser = useMemo(() => {
    return users.find((user) => user.id === selectedUserId) || null;
  }, [selectedUserId, users]);

  const currentIndex = useMemo(() => {
    if (!selectedUser) return 0;
    const index = PERMISSION_FLOW.indexOf(selectedUser.role);
    return index >= 0 ? index : 0;
  }, [selectedUser]);

  const hasNext = currentIndex < PERMISSION_FLOW.length - 1;
  const hasPrev = currentIndex > 0;

  const refreshUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "No se pudo cargar los usuarios.");
      }

      const data = (await response.json()) as { users?: ManagedUser[] };
      const rows = Array.isArray(data.users) ? data.users : [];
      setUsers(rows);
      if (!selectedUserId && rows.length > 0) {
        setSelectedUserId(rows[0].id);
      } else if (selectedUserId && !rows.some((row) => row.id === selectedUserId)) {
        setSelectedUserId(rows[0]?.id || "");
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo cargar usuarios.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUsers();
  }, []);

  const applyRole = async (nextIndex: number) => {
    if (!selectedUser) return;
    const safeIndex = clampPermissionIndex(nextIndex);
    const nextRole = PERMISSION_FLOW[safeIndex];
    const nextGrade = getDefaultGradeForRole(nextRole);

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: nextRole,
          grade: nextGrade,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: ManagedUser;
      };

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el permiso.");
      }

      if (data.user) {
        setUsers((prev) =>
          prev.map((row) => (row.id === data.user!.id ? data.user! : row)),
        );
      }

      toast({
        title: "Permiso actualizado",
        description: `Nuevo rol: ${USER_ROLE_LABELS[nextRole]}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo actualizar permiso.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setConfirmPrevOpen(false);
    }
  };

  if (loading) {
    return (
      <section className="container mx-auto px-4 py-8 md:px-6">
        <Card className="rounded-3xl p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando handler de permisos...
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className="container mx-auto px-4 py-8 md:px-6">
      <Card className="rounded-3xl border bg-card/85 p-6 shadow-xl backdrop-blur-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary">
              Handler de Permisos
            </p>
            <h1 className="mt-2 text-3xl font-bold">Control de permisos</h1>
          </div>
          <Button type="button" variant="outline" onClick={refreshUsers} disabled={saving}>
            Refrescar
          </Button>
        </div>

        {users.length === 0 ? (
          <div className="mt-6 rounded-2xl border p-4 text-sm text-muted-foreground">
            No hay usuarios disponibles para gestionar.
          </div>
        ) : (
          <>
            <div className="mt-6">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Usuario objetivo
                </span>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  disabled={saving}
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || "Sin nombre"} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedUser ? (
              <>
                <div className="mt-6 rounded-3xl border bg-background/70 p-8 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    Permiso actual
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Shield className="h-8 w-8 text-primary" />
                    <p className="text-4xl font-bold md:text-6xl">
                      {USER_ROLE_LABELS[selectedUser.role]}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Grado recomendado para este rol: {getDefaultGradeForRole(selectedUser.role)}
                  </p>
                  <div className="mt-3">
                    <Badge variant="secondary">Rol interno: {selectedUser.role}</Badge>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <AlertDialog open={confirmPrevOpen} onOpenChange={setConfirmPrevOpen}>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-14 text-base font-semibold"
                      disabled={!hasPrev || saving}
                      onClick={() => setConfirmPrevOpen(true)}
                    >
                      <ArrowBigLeft className="mr-2 h-5 w-5" />
                      Volver al permiso anterior
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar retroceso de permiso</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta accion reducira el permiso del usuario al nivel anterior.
                          Deseas continuar?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(event) => {
                            event.preventDefault();
                            applyRole(currentIndex - 1);
                          }}
                          disabled={saving}
                        >
                          {saving ? "Aplicando..." : "Confirmar"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <Button
                    type="button"
                    className="h-14 text-base font-semibold"
                    disabled={!hasNext || saving}
                    onClick={() => applyRole(currentIndex + 1)}
                  >
                    <ArrowBigRight className="mr-2 h-5 w-5" />
                    Siguiente permiso
                  </Button>
                </div>
              </>
            ) : null}
          </>
        )}
      </Card>
    </section>
  );
}
