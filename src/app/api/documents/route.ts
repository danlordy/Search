import { NextRequest, NextResponse } from "next/server";
import { listDocuments, listDocumentsPage } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const sectionId = params.get("sectionId");
    const query = params.get("query");
    const pageParam = params.get("page");
    const pageSizeParam = params.get("pageSize");
    const extensionsParam = params.get("extensions");

    const extensions =
      typeof extensionsParam === "string" && extensionsParam.trim()
        ? extensionsParam.split(",").map((item) => item.trim())
        : null;

    const hasPagedFilters =
      pageParam !== null ||
      pageSizeParam !== null ||
      query !== null ||
      extensionsParam !== null;

    if (hasPagedFilters) {
      const result = listDocumentsPage({
        sectionIdRaw: sectionId,
        query,
        extensions,
        page: pageParam ? Number(pageParam) : undefined,
        pageSize: pageSizeParam ? Number(pageSizeParam) : undefined,
      });

      return NextResponse.json({
        success: true,
        sectionId: result.sectionId,
        documents: result.documents,
        count: result.documents.length,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
      });
    }

    const documents = listDocuments(sectionId);

    return NextResponse.json({
      success: true,
      sectionId: sectionId || "todos",
      documents,
      count: documents.length,
    });
  } catch (error) {
    console.error("Documents read error:", error);
    return NextResponse.json(
      {
        error: "Failed to read documents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
