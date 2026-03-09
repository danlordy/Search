import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSettings, isIndexedDocumentPath } from "@/lib/db";

export const runtime = "nodejs";

const INLINE_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "text/csv",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".xml":
      return "application/xml";
    case ".csv":
      return "text/csv";
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xls":
      return "application/vnd.ms-excel";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".ppt":
      return "application/vnd.ms-powerpoint";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".md":
      return "text/markdown";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function shouldRenderInline(mimeType: string): boolean {
  if (mimeType.startsWith("text/") || mimeType.startsWith("image/")) return true;
  return INLINE_CONTENT_TYPES.has(mimeType);
}

function normalizeRequestedPath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed.includes("\0")) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  if (/^file:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "file:") return null;
      let pathname = decodeURIComponent(parsed.pathname);
      if (process.platform === "win32" && pathname.startsWith("/")) {
        pathname = pathname.slice(1);
      }
      return pathname.replace(/\//g, path.sep);
    } catch {
      return null;
    }
  }

  return trimmed;
}

function normalizeForComparison(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function canonicalizePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizeForComparison(targetPath);
  const normalizedRoot = normalizeForComparison(rootPath);
  const relative = path.relative(normalizedRoot, normalizedTarget);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function collectAllowedRoots(): string[] {
  const settings = getSettings();
  const roots = new Set<string>();

  const addRoot = (candidate: unknown) => {
    if (typeof candidate !== "string" || !candidate.trim()) return;

    try {
      const canonical = canonicalizePath(candidate.trim());
      if (!fs.existsSync(canonical)) return;
      const stat = fs.statSync(canonical);
      if (!stat.isDirectory()) return;
      roots.add(canonical);
    } catch {
      // Ignore invalid or inaccessible roots.
    }
  };

  const globalRoots = Array.isArray(settings.indexPaths) ? settings.indexPaths : [];
  globalRoots.forEach(addRoot);

  const sections = Array.isArray(settings.sections) ? settings.sections : [];
  sections.forEach((section) => {
    const sectionRoots = Array.isArray(section.indexPaths) ? section.indexPaths : [];
    sectionRoots.forEach(addRoot);
  });

  return Array.from(roots);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const pathParam = searchParams.get("path");

  if (!pathParam) {
    return new NextResponse("File path is required", { status: 400 });
  }

  const requestedPath = normalizeRequestedPath(pathParam);
  if (!requestedPath) {
    return new NextResponse("Invalid file path", { status: 400 });
  }

  if (!path.isAbsolute(requestedPath)) {
    return new NextResponse("Absolute file path is required", { status: 400 });
  }

  const filePath = canonicalizePath(requestedPath);

  try {
    if (!fs.existsSync(filePath)) {
      return new NextResponse("File not found", { status: 404 });
    }

    const fileStat = fs.statSync(filePath);
    if (!fileStat.isFile()) {
      return new NextResponse("Path is not a file", { status: 400 });
    }

    const allowedRoots = collectAllowedRoots();
    const allowedByRoot = allowedRoots.some((root) => isPathWithinRoot(filePath, root));
    const allowedByIndex = isIndexedDocumentPath(requestedPath) || isIndexedDocumentPath(filePath);

    if (!allowedByRoot && !allowedByIndex) {
      return new NextResponse("Access denied for this file path", { status: 403 });
    }

    const fileBuffer = await fs.promises.readFile(filePath);
    const mimeType = getMimeType(filePath);
    const filename = path.basename(filePath);
    const disposition = shouldRenderInline(mimeType) ? "inline" : "attachment";

    const headers = new Headers();
    headers.set("Content-Type", mimeType);
    headers.set("Content-Length", String(fileBuffer.byteLength));
    headers.set(
      "Content-Disposition",
      `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, no-store, max-age=0");

    return new Response(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Error reading file:", error);
    return new NextResponse("Error reading file", { status: 500 });
  }
}
