"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth/client";
import {
  DEFAULT_USER_ROLE,
  getDefaultLandingPath,
} from "@/lib/auth/permissions";

type AuthMode = "login" | "register";

function safeNextPath(nextValue: string | null, fallback: string) {
  if (!nextValue) return fallback;
  if (!nextValue.startsWith("/") || nextValue.startsWith("//")) return fallback;
  if (nextValue.startsWith("/login")) return fallback;
  return nextValue;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const defaultLandingPath = useMemo(
    () => getDefaultLandingPath(sessionData?.user),
    [sessionData?.user],
  );

  const nextPath = useMemo(
    () => safeNextPath(searchParams.get("next"), defaultLandingPath),
    [defaultLandingPath, searchParams],
  );

  useEffect(() => {
    if (!sessionPending && sessionData?.user) {
      router.replace(nextPath);
    }
  }, [nextPath, router, sessionData?.user, sessionPending]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) return;
    if (mode === "register" && !name.trim()) return;

    setSubmitting(true);
    try {
      if (mode === "login") {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });

        if (result?.error) {
          throw new Error(result.error.message || "No se pudo iniciar sesion.");
        }
      } else {
        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });

        if (result?.error) {
          throw new Error(result.error.message || "No se pudo crear la cuenta.");
        }
      }

      const registerLandingPath = getDefaultLandingPath({
        role: DEFAULT_USER_ROLE,
      });
      const targetPath =
        mode === "register"
          ? safeNextPath(searchParams.get("next"), registerLandingPath)
          : nextPath;

      router.replace(targetPath);
      router.refresh();
    } catch (error) {
      console.error("Authentication failed:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "No se pudo completar la autenticacion.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container mx-auto flex min-h-[calc(100vh-8rem)] max-w-md items-center px-4 py-10">
      <Card className="w-full p-6">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-2xl font-bold">Acceso</h1>
          <p className="text-sm text-muted-foreground">
            Inicia sesion o crea una cuenta local.
          </p>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            type="button"
            variant={mode === "login" ? "default" : "ghost"}
            onClick={() => setMode("login")}
          >
            Login
          </Button>
          <Button
            type="button"
            variant={mode === "register" ? "default" : "ghost"}
            onClick={() => setMode("register")}
          >
            Registro
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Nombre</Label>
              <Input
                id="auth-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Correo</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@dominio.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Contrasena</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? "Procesando..."
              : mode === "login"
                ? "Iniciar Sesion"
                : "Crear Cuenta"}
          </Button>
        </form>
      </Card>
    </section>
  );
}
