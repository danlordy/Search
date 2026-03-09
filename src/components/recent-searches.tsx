"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Eye, EyeOff, Tag, Trash2 } from "lucide-react";
import { SearchEntry } from "@/hooks/use-search-history";
import { FileIcon } from "@/components/file-icon";
import { DocumentDetailsDialog } from "@/components/document-details-dialog";
import { DocumentMetadataEditor } from "@/components/document-metadata-editor";

interface RecentSearchesProps {
  searches: SearchEntry[];
  onSearch?: (document: any) => void;
  onClear: () => void;
  onOpenResult?: (entry: SearchEntry) => void;
  onMetadataSaved?: (document: any) => void;
  onRemoveEntry?: (entry: SearchEntry) => void;
  onVisibilityChange?: (open: boolean) => void;
  sectionId?: string;
}

const MAX_TOP_ACCESSED = 8;

function getEntryKey(entry: SearchEntry): string | null {
  if (!entry || !entry.document) return null;
  if (
    (typeof entry.document.id === "number" && Number.isFinite(entry.document.id)) ||
    (typeof entry.document.id === "string" && entry.document.id.trim())
  ) {
    return `id:${entry.document.id}`;
  }
  if (entry.document.ruta) return `ruta:${entry.document.ruta}`;
  return null;
}

function mergeEntries(entries: SearchEntry[]): SearchEntry[] {
  const merged = new Map<string, SearchEntry>();

  entries.forEach((entry) => {
    const key = getEntryKey(entry);
    if (!key) return;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, entry);
      return;
    }

    merged.set(key, {
      document: entry.lastAccessed >= existing.lastAccessed ? entry.document : existing.document,
      count: existing.count + entry.count,
      lastAccessed: Math.max(existing.lastAccessed, entry.lastAccessed),
    });
  });

  return Array.from(merged.values());
}

export function RecentSearches({
  searches,
  onClear,
  onOpenResult,
  onMetadataSaved,
  onRemoveEntry,
  onVisibilityChange,
  sectionId,
}: RecentSearchesProps) {
  const storageKey = `recent_history_panel_open:${sectionId || "default"}`;
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const stored = localStorage.getItem(storageKey);
      if (stored === "0") setIsOpen(false);
      if (stored === "1") setIsOpen(true);
    } catch {
      // ignore localStorage errors
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem(storageKey, isOpen ? "1" : "0");
    } catch {
      // ignore localStorage errors
    }
  }, [storageKey, isOpen]);

  useEffect(() => {
    onVisibilityChange?.(isOpen);
  }, [isOpen, onVisibilityChange]);

  const sortedSearches = useMemo(() => {
    const validSearches = searches.filter(
      (entry) =>
        entry &&
        entry.document &&
        entry.document.ruta &&
        entry.document.nombre &&
        typeof entry.count === "number"
    );

    return mergeEntries(validSearches)
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TOP_ACCESSED);
  }, [searches]);

  if (sortedSearches.length === 0) {
    return null;
  }

  const getPrecioLabel = (entry: SearchEntry) => {
    const doc = entry.document as any;
    const precio = doc?.metadata?.precio ?? doc?.precio;
    if (precio === undefined || precio === null || precio === "") return null;
    return typeof precio === "number" ? "$" + precio : String(precio);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-4 z-50 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-lg"
        title="Mostrar historial"
      >
        <Eye className="h-4 w-4" />
        Historial
      </button>
    );
  }

  return (
    <aside className="fixed right-4 top-20 bottom-4 z-40 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border bg-card shadow-xl flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Historial</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground"
            title="Limpiar historial"
          >
            Limpiar
          </button>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-accent"
            title="Ocultar historial"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto p-3 space-y-2">
        {sortedSearches.map((entry, index) => (
          <a
            key={getEntryKey(entry) || `${entry.document.ruta}-${index}`}
            href={`/api/files?path=${encodeURIComponent(entry.document.ruta)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onOpenResult?.(entry)}
            className="group relative block rounded-lg border bg-background p-3 pr-24 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-start gap-2">
              <FileIcon filename={entry.document.nombre} className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{entry.document.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{entry.document.ruta}</p>
                {getPrecioLabel(entry) && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold">
                    <Tag className="h-3 w-3" />
                    {getPrecioLabel(entry)}
                  </span>
                )}
              </div>
            </div>

            <div
              className="absolute top-2 right-2 flex items-center gap-1"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <span className="inline-flex items-center justify-center min-w-6 h-6 rounded-full bg-primary text-primary-foreground px-1 text-xs font-bold">
                {entry.count}
              </span>
              <DocumentDetailsDialog document={entry.document} />
              <DocumentMetadataEditor
                document={entry.document as any}
                sectionId={sectionId ?? "default"}
                onSaved={(doc) => onMetadataSaved?.(doc)}
              />
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-destructive/10"
                title="Eliminar del historial"
                onClick={() => onRemoveEntry?.(entry)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </a>
        ))}
      </div>
    </aside>
  );
}
