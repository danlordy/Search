import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { replaceDocumentsForSection } from "@/lib/db";

export const runtime = "nodejs";

type DocumentCandidate = {
  nombre: string;
  ruta: string;
};

async function getFilesRecursive(dirPath: string): Promise<DocumentCandidate[]> {
  const files: DocumentCandidate[] = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const nested = await getFilesRecursive(fullPath);
        files.push(...nested);
        continue;
      }

      if (entry.isFile()) {
        files.push({
          nombre: entry.name,
          ruta: fullPath,
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return files;
}

export async function POST(request: NextRequest) {
  try {
    const { indexPaths, sectionId } = await request.json();

    if (!indexPaths || !Array.isArray(indexPaths) || indexPaths.length === 0) {
      return NextResponse.json(
        { error: "No index paths provided" },
        { status: 400 }
      );
    }

    const normalizedPaths = indexPaths
      .filter((item: unknown) => typeof item === "string")
      .map((item: string) => item.trim())
      .filter(Boolean);

    if (normalizedPaths.length === 0) {
      return NextResponse.json(
        { error: "No valid index paths provided" },
        { status: 400 }
      );
    }

    const allDocuments: DocumentCandidate[] = [];
    for (const dirPath of normalizedPaths) {
      const files = await getFilesRecursive(dirPath);
      allDocuments.push(...files);
    }

    allDocuments.sort((a, b) => a.ruta.localeCompare(b.ruta));

    const replaced = replaceDocumentsForSection(sectionId, allDocuments);

    return NextResponse.json({
      success: true,
      message: `Indexed ${replaced.count} files`,
      count: replaced.count,
      scanned: allDocuments.length,
      sectionId: replaced.sectionId,
    });
  } catch (error) {
    console.error("Indexing error:", error);
    return NextResponse.json(
      {
        error: "Failed to index documents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
