import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import { auth } from "@/lib/auth/auth";
import { getSettings, saveSettings } from "@/lib/db";
import { canAccessGlobalSettings, getSessionUser } from "@/lib/auth/permissions";
import { normalizeSettings, type Section } from "@/lib/settings";

export const runtime = "nodejs";

type MissingPath = {
  sectionId: string;
  path: string;
};

async function validateSectionIndexPaths(sections: Section[]) {
  const missing: MissingPath[] = [];

  for (const section of sections) {
    const sectionId = section.id || "unknown";
    const paths = Array.isArray(section.indexPaths) ? section.indexPaths : [];

    for (const rawPath of paths) {
      if (!rawPath || typeof rawPath !== "string") continue;
      try {
        await fs.access(rawPath);
      } catch {
        missing.push({ sectionId, path: rawPath });
      }
    }
  }

  return missing;
}

export async function GET() {
  try {
    const settings = getSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error reading settings:", error);
    return NextResponse.json(normalizeSettings(null));
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    const sessionUser = getSessionUser(session);

    if (!sessionUser || !canAccessGlobalSettings(sessionUser)) {
      return NextResponse.json(
        { error: "No tienes permisos para modificar la configuración global." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const normalized = normalizeSettings(body);

    if (!normalized.appTitle || !normalized.appSubtitle) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const missing = await validateSectionIndexPaths(normalized.sections || []);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Hay rutas que no existen. Corrige las rutas antes de guardar.",
          missing,
        },
        { status: 400 }
      );
    }

    const saved = saveSettings(normalized);

    return NextResponse.json({
      success: true,
      settings: saved,
    });
  } catch (error) {
    console.error("Error saving settings:", error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }
}
