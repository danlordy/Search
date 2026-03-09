export type Section = {
  id: string;
  label: string;
  description?: string;
  documentsPath: string;
  statsPath: string;
  indexPaths?: string[];
};

export interface Settings {
  indexPaths: string[];
  appTitle: string;
  appSubtitle: string;
  logoUrl: string;
  showAppTitle: boolean;
  showAppSubtitle: boolean;
  useAbrirAdobe?: boolean;
  fileExtensions: string[];
  sections: Section[];
}

const SECTION_ID_PATTERN = /[^a-z0-9-_]/g;

export const DEFAULT_SECTIONS: Section[] = [];

export const DEFAULT_SETTINGS: Settings = {
  indexPaths: [],
  appTitle: "FileFinder",
  appSubtitle: "Find your local files instantly",
  logoUrl: "",
  showAppTitle: true,
  showAppSubtitle: true,
  useAbrirAdobe: false,
  fileExtensions: ["pdf", "docx"],
  sections: DEFAULT_SECTIONS,
};

export function sanitizeSectionId(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.toLowerCase().trim().replace(SECTION_ID_PATTERN, "");
}

export function normalizeSectionId(raw?: string | null): string {
  const safe = sanitizeSectionId(raw);
  if (!safe || safe === "todos") return "default";
  return safe;
}

function buildSectionDataPath(sectionId: string) {
  const safeId = sanitizeSectionId(sectionId) || "default";
  return {
    documentsPath: safeId === "default" ? "/data/documents.json" : `/data/documents-${safeId}.json`,
    statsPath: safeId === "default" ? "/data/search-stats.json" : `/data/search-stats-${safeId}.json`,
  };
}

function normalizeStringArray(input: unknown, options?: { lower?: boolean }): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const values: string[] = [];

  input.forEach((item) => {
    if (typeof item !== "string") return;
    const value = options?.lower ? item.toLowerCase().trim() : item.trim();
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    values.push(value);
  });

  return values;
}

function normalizeSections(input: unknown): Section[] {
  if (!Array.isArray(input) || input.length === 0) {
    return DEFAULT_SECTIONS.map((section) => ({ ...section, indexPaths: [...(section.indexPaths || [])] }));
  }

  const uniqueSections: Section[] = [];
  const seen = new Set<string>();

  input.forEach((rawSection) => {
    if (!rawSection || typeof rawSection !== "object") return;
    const asRecord = rawSection as Record<string, unknown>;
    const id = sanitizeSectionId(typeof asRecord.id === "string" ? asRecord.id : "");
    if (!id || seen.has(id)) return;

    seen.add(id);
    const fallbackPaths = buildSectionDataPath(id);
    const label = typeof asRecord.label === "string" && asRecord.label.trim() ? asRecord.label.trim() : id;
    const description = typeof asRecord.description === "string" ? asRecord.description.trim() : "";

    const documentsPath =
      typeof asRecord.documentsPath === "string" && asRecord.documentsPath.trim()
        ? asRecord.documentsPath.trim()
        : fallbackPaths.documentsPath;

    const statsPath =
      typeof asRecord.statsPath === "string" && asRecord.statsPath.trim()
        ? asRecord.statsPath.trim()
        : fallbackPaths.statsPath;

    uniqueSections.push({
      id,
      label,
      description,
      documentsPath,
      statsPath,
      indexPaths: normalizeStringArray(asRecord.indexPaths),
    });
  });

  if (uniqueSections.length === 0) {
    return DEFAULT_SECTIONS.map((section) => ({ ...section, indexPaths: [...(section.indexPaths || [])] }));
  }

  return uniqueSections;
}

export function normalizeSettings(input: unknown): Settings {
  if (!input || typeof input !== "object") {
    return {
      ...DEFAULT_SETTINGS,
      sections: DEFAULT_SECTIONS.map((section) => ({ ...section, indexPaths: [...(section.indexPaths || [])] })),
      fileExtensions: [...DEFAULT_SETTINGS.fileExtensions],
      indexPaths: [...DEFAULT_SETTINGS.indexPaths],
    };
  }

  const raw = input as Record<string, unknown>;
  const sections = normalizeSections(raw.sections);
  const normalizedExtensions = normalizeStringArray(raw.fileExtensions, { lower: true });

  return {
    indexPaths: normalizeStringArray(raw.indexPaths),
    appTitle:
      typeof raw.appTitle === "string" && raw.appTitle.trim()
        ? raw.appTitle.trim()
        : DEFAULT_SETTINGS.appTitle,
    appSubtitle:
      typeof raw.appSubtitle === "string" && raw.appSubtitle.trim()
        ? raw.appSubtitle.trim()
        : DEFAULT_SETTINGS.appSubtitle,
    logoUrl: typeof raw.logoUrl === "string" ? raw.logoUrl : "",
    showAppTitle: typeof raw.showAppTitle === "boolean" ? raw.showAppTitle : true,
    showAppSubtitle: typeof raw.showAppSubtitle === "boolean" ? raw.showAppSubtitle : true,
    useAbrirAdobe: typeof raw.useAbrirAdobe === "boolean" ? raw.useAbrirAdobe : false,
    fileExtensions: normalizedExtensions.length
      ? normalizedExtensions
      : [...DEFAULT_SETTINGS.fileExtensions],
    sections,
  };
}

export function resolveSectionPaths(sectionId: string) {
  return buildSectionDataPath(sectionId);
}
