import { useState, useEffect, useMemo } from "react";
import { useSettings, DEFAULT_SECTIONS } from "@/hooks/use-settings";

export interface Document {
  id: string;
  nombre: string;
  ruta: string;
  sectionId?: string;
  metadata?: Record<string, string | number | undefined>;
  maestro?: string;
  paginas?: number | string;
  precio?: number | string;
  universidad?: string;
}

const DEFAULT_VISIBLE_EXTENSION = "pdf";
const CUSTOM_EXTENSIONS_STORAGE_KEY = "documents_custom_extensions";
const SEARCH_DEBOUNCE_MS = 250;

type DocumentsApiResponse = {
  documents?: Document[];
  count?: number;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

export function useDocuments() {
  const { settings, isLoaded: settingsLoaded } = useSettings();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([DEFAULT_VISIBLE_EXTENSION]);
  const [customExtensions, setCustomExtensions] = useState<string[]>([]);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const availableSections = useMemo(
    () => (settings.sections?.length ? settings.sections : DEFAULT_SECTIONS),
    [settings.sections]
  );

  const availableExtensions = useMemo(() => {
    const fromSettings = Array.isArray(settings.fileExtensions) ? settings.fileExtensions : [];
    const normalized = fromSettings
      .map((extension) => extension.toLowerCase().trim().replace(/^\./, ""))
      .filter(Boolean);
    const merged = Array.from(new Set([DEFAULT_VISIBLE_EXTENSION, ...normalized, ...customExtensions]));
    return merged;
  }, [settings.fileExtensions, customExtensions]);

  const [selectedSection, setSelectedSection] = useState<string>(availableSections[0]?.id || "default");

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(CUSTOM_EXTENSIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const normalized = parsed
        .filter((item) => typeof item === "string")
        .map((item) => item.toLowerCase().trim().replace(/^\./, ""))
        .filter(Boolean);

      setCustomExtensions(Array.from(new Set(normalized)));
    } catch (error) {
      console.error("Failed to read custom extensions:", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(CUSTOM_EXTENSIONS_STORAGE_KEY, JSON.stringify(customExtensions));
    } catch (error) {
      console.error("Failed to persist custom extensions:", error);
    }
  }, [customExtensions]);

  useEffect(() => {
    if (!settingsLoaded || availableSections.length === 0) return;

    const hasCurrent = availableSections.some((section) => section.id === selectedSection);
    if (!selectedSection || !hasCurrent) {
      setSelectedSection(availableSections[0].id);
    }
  }, [availableSections, selectedSection, settingsLoaded]);

  useEffect(() => {
    setSelectedExtensions((previous) => {
      const stillAllowed = previous.filter((extension) => availableExtensions.includes(extension));
      if (stillAllowed.length > 0) return stillAllowed;
      if (availableExtensions.includes(DEFAULT_VISIBLE_EXTENSION)) return [DEFAULT_VISIBLE_EXTENSION];
      if (availableExtensions.length > 0) return [availableExtensions[0]];
      return [DEFAULT_VISIBLE_EXTENSION];
    });
  }, [availableExtensions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!settingsLoaded || !selectedSection) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const fetchDocuments = async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          sectionId: selectedSection,
          page: String(currentPage),
          pageSize: String(itemsPerPage),
        });

        if (debouncedSearchQuery) {
          queryParams.set("query", debouncedSearchQuery);
        }

        if (selectedExtensions.length > 0) {
          queryParams.set("extensions", selectedExtensions.join(","));
        }

        const response = await fetch(`/api/documents?${queryParams.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load documents (${response.status})`);
        }

        const data = (await response.json()) as DocumentsApiResponse;
        if (!active) return;

        const nextDocuments = Array.isArray(data.documents) ? data.documents : [];
        const nextTotalRaw =
          typeof data.total === "number" && Number.isFinite(data.total)
            ? data.total
            : typeof data.count === "number" && Number.isFinite(data.count)
              ? data.count
              : nextDocuments.length;
        const nextTotal = Math.max(0, Math.floor(nextTotalRaw));
        const nextTotalPagesRaw =
          typeof data.totalPages === "number" && Number.isFinite(data.totalPages)
            ? data.totalPages
            : Math.ceil(nextTotal / itemsPerPage);
        const nextTotalPages = Math.max(1, Math.floor(nextTotalPagesRaw || 1));
        const nextPageRaw =
          typeof data.page === "number" && Number.isFinite(data.page) ? data.page : currentPage;
        const nextPage = Math.max(1, Math.min(nextTotalPages, Math.floor(nextPageRaw)));

        setDocuments(nextDocuments);
        setFilteredTotal(nextTotal);
        setTotalPages(nextTotalPages);
        if (nextPage !== currentPage) {
          setCurrentPage(nextPage);
        }
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") {
          return;
        }

        if (!active) return;
        console.error("Error loading documents:", error);
        setDocuments([]);
        setFilteredTotal(0);
        setTotalPages(1);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDocuments();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    currentPage,
    debouncedSearchQuery,
    itemsPerPage,
    selectedExtensions,
    selectedSection,
    settingsLoaded,
  ]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const setSelectedSectionHandler = (section: string) => {
    setSelectedSection(section);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleItemsPerPageChange = (items: number) => {
    setItemsPerPage(items);
    setCurrentPage(1);
  };

  const updateDocumentPrice = (docId: string, price: number) => {
    setDocuments((prevDocs) =>
      prevDocs.map((doc) => (doc.id === docId ? { ...doc, precio: price } : doc))
    );
  };

  const updateDocument = (updated: Partial<Document> & { id: string }) => {
    setDocuments((prevDocs) =>
      prevDocs.map((doc) => (doc.id === updated.id ? { ...doc, ...updated } : doc))
    );
  };

  const toggleExtension = (extension: string) => {
    const normalized = extension.toLowerCase().trim().replace(/^\./, "");
    if (!normalized) return;

    setSelectedExtensions((previous) => {
      if (previous.includes(normalized)) {
        if (previous.length === 1) return previous;
        return previous.filter((item) => item !== normalized);
      }
      if (!availableExtensions.includes(normalized)) return previous;
      return [...previous, normalized];
    });
    setCurrentPage(1);
  };

  const selectAllExtensions = () => {
    setSelectedExtensions(availableExtensions);
    setCurrentPage(1);
  };

  const selectOnlyExtension = (extension: string) => {
    const normalized = extension.toLowerCase().trim().replace(/^\./, "");
    if (!normalized) return;
    if (!availableExtensions.includes(normalized)) return;
    setSelectedExtensions([normalized]);
    setCurrentPage(1);
  };

  const addCustomExtension = (extension: string) => {
    const normalized = extension.toLowerCase().trim().replace(/^\./, "");

    if (!normalized) {
      return { ok: false as const, error: "Escribe una extensión válida" };
    }

    if (!/^[a-z0-9]+$/.test(normalized)) {
      return { ok: false as const, error: "Solo letras y números en la extensión" };
    }

    if (availableExtensions.includes(normalized)) {
      return { ok: false as const, error: "Esa extensión ya existe" };
    }

    setCustomExtensions((previous) => [...previous, normalized]);
    setSelectedExtensions((previous) =>
      previous.includes(normalized) ? previous : [...previous, normalized]
    );
    setCurrentPage(1);

    return { ok: true as const, extension: normalized };
  };

  const removeCustomExtension = (extension: string) => {
    const normalized = extension.toLowerCase().trim().replace(/^\./, "");
    if (!normalized || !customExtensions.includes(normalized)) return;

    setCustomExtensions((previous) => previous.filter((item) => item !== normalized));
    setSelectedExtensions((previous) => {
      const next = previous.filter((item) => item !== normalized);
      if (next.length > 0) return next;

      const remaining = availableExtensions.filter((item) => item !== normalized);
      if (remaining.includes(DEFAULT_VISIBLE_EXTENSION)) return [DEFAULT_VISIBLE_EXTENSION];
      if (remaining.length > 0) return [remaining[0]];
      return [DEFAULT_VISIBLE_EXTENSION];
    });
    setCurrentPage(1);
  };

  return {
    documents,
    allDocuments: documents,
    availableSections,
    availableExtensions,
    customExtensions,
    selectedExtensions,
    selectedSection,
    setSelectedSection: setSelectedSectionHandler,
    toggleExtension,
    selectAllExtensions,
    selectOnlyExtension,
    addCustomExtension,
    removeCustomExtension,
    searchQuery,
    handleSearch,
    itemsPerPage,
    handleItemsPerPageChange,
    currentPage,
    handlePageChange,
    totalPages,
    filteredTotal,
    loading,
    updateDocumentPrice,
    updateDocument,
  };
}
