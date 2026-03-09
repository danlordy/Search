import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth/permissions";
import { getServerSession } from "@/lib/auth/server";

function LoginFallback() {
  return (
    <section className="container mx-auto flex min-h-[calc(100vh-8rem)] max-w-md items-center px-4 py-10">
      <div className="w-full rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground">Cargando formulario...</p>
      </div>
    </section>
  );
}

export default async function LoginPage() {
  const session = await getServerSession();
  const sessionUser = getSessionUser(session);

  if (sessionUser) {
    redirect("/");
  }

  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
