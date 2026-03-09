import { useState, useEffect, useCallback } from "react";

export type DocumentMetadata = {
  maestro?: string;
  paginas?: number | string;
  precio?: number | string;
  universidad?: string;
  metadata?: Record<string, string | number | undefined>;
};

export type DocumentInfo = {
  id: string | number;
  nombre: string;
  ruta: string;
  maestro?: string;
  paginas?: number | string;
  precio?: number | string;
  universidad?: string;
  metadata?: Record<string, string | number | undefined>;
};

export type SearchEntry = {
  document: DocumentInfo;
  count: number;
  lastAccessed: number;
};

const STORAGE_KEY = "search_history";
const MAX_RECENT_SEARCHES = 8;

function hasValidDocumentId(value: unknown): value is string | number {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return false;
}

function getDocumentKey(document: Partial<DocumentInfo> | undefined | null): string | null {
  if (!document) return null;
  if (hasValidDocumentId(document.id)) return `id:${document.id}`;
  if (typeof document.ruta === "string" && document.ruta) return `ruta:${document.ruta}`;
  return null;
}

function normalizeEntries(entries: SearchEntry[]): SearchEntry[] {
  const merged = new Map<string, SearchEntry>();

  entries.forEach((entry) => {
    if (!entry || typeof entry.count !== "number" || typeof entry.lastAccessed !== "number") return;
    if (!entry.document || !entry.document.ruta || !entry.document.nombre) return;

    const key = getDocumentKey(entry.document);
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

  return Array.from(merged.values())
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, MAX_RECENT_SEARCHES);
}

export function useSearchHistory(sectionId: string = "default") {
  const [recentSearches, setRecentSearches] = useState<SearchEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const storageKey = `${STORAGE_KEY}:${sectionId}`;

  // Load from localStorage on mount
  useEffect(() => {
    const loadHistory = () => {
      try {
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            const rawEntries = Array.isArray(parsed) ? (parsed as SearchEntry[]) : [];
            const normalized = normalizeEntries(rawEntries);
            setRecentSearches(normalized);

            // Persist normalized data to migrate legacy keys (ruta) to stable id matching.
            if (normalized.length !== rawEntries.length) {
              localStorage.setItem(storageKey, JSON.stringify(normalized));
            }
          }
          setIsLoaded(true);
        }
      } catch (error) {
        console.error("Failed to load search history:", error);
        // Clear invalid data
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem(storageKey);
          }
        } catch (e) {
          console.error("Failed to clear invalid history:", e);
        }
        setIsLoaded(true);
      }
    };

    loadHistory();
  }, [storageKey]);

  // Add or update a file access to history
  const addSearch = useCallback(
    (document: DocumentInfo) => {
      const documentKey = getDocumentKey(document);
      if (!document || !document.ruta || !documentKey) return;

      setRecentSearches((prev) => {
        // Match by stable id first (fallback to ruta for legacy entries).
        const existingIndex = prev.findIndex((entry) => getDocumentKey(entry.document) === documentKey);
        let updated: SearchEntry[];

        if (existingIndex >= 0) {
          // Update count and timestamp for existing document
          const existing = prev[existingIndex];
          const newEntry: SearchEntry = {
            document,
            count: existing.count + 1,
            lastAccessed: Date.now(),
          };
          // Move to beginning and remove old entry
          updated = [newEntry, ...prev.slice(0, existingIndex), ...prev.slice(existingIndex + 1)];
        } else {
          // Add new document at the beginning
          updated = [{ document, count: 1, lastAccessed: Date.now() }, ...prev];
        }

        // Normalize and keep only top MAX_RECENT_SEARCHES.
        const sliced = normalizeEntries(updated);
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem(storageKey, JSON.stringify(sliced));
          }
        } catch (error) {
          console.error("Failed to save search history:", error);
        }

        return sliced;
      });
    },
    [storageKey]
  );

  const updateSearchMetadata = useCallback(
    (document: DocumentInfo) => {
      const documentKey = getDocumentKey(document);
      if (!document || !document.ruta || !documentKey) return;

      setRecentSearches((prev) => {
        const existingIndex = prev.findIndex((entry) => getDocumentKey(entry.document) === documentKey);
        if (existingIndex < 0) return prev;

        const updated = [...prev];
        const existing = prev[existingIndex];
        updated[existingIndex] = { ...existing, document };
        const normalized = normalizeEntries(updated);

        try {
          if (typeof window !== "undefined") {
            localStorage.setItem(storageKey, JSON.stringify(normalized));
          }
        } catch (error) {
          console.error("Failed to update search history:", error);
        }

        return normalized;
      });
    },
    [storageKey]
  );

  const removeSearch = useCallback(
    (document: Partial<DocumentInfo> | null | undefined) => {
      const documentKey = getDocumentKey(document as DocumentInfo | undefined);
      if (!documentKey) return;

      setRecentSearches((prev) => {
        const updated = prev.filter((entry) => getDocumentKey(entry.document) !== documentKey);

        try {
          if (typeof window !== "undefined") {
            localStorage.setItem(storageKey, JSON.stringify(updated));
          }
        } catch (error) {
          console.error("Failed to update search history:", error);
        }

        return updated;
      });
    },
    [storageKey]
  );

  // Clear all history
  const clearHistory = useCallback(() => {
    setRecentSearches([]);
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error("Failed to clear search history:", error);
    }
  }, [storageKey]);

  return {
    recentSearches,
    addSearch,
    updateSearchMetadata,
    removeSearch,
    clearHistory,
    isLoaded,
  };
}
