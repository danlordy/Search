import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { getSessionUser } from "@/lib/auth/permissions";

export async function getServerSession() {
  const requestHeaders = await headers();
  return auth.api.getSession({
    headers: requestHeaders,
  });
}

export async function getRequestSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export async function requireServerSession(nextPath = "/dashboard") {
  const session = await getServerSession();
  const user = getSessionUser(session);

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return session;
}
