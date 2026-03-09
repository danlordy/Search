import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  applyMetadataToDocument,
  cleanMetadata,
  extractInlineMetadata,
  type MetadataByDocumentId,
  type MetadataValue,
} from "@/lib/document-metadata";
import {
  DEFAULT_SETTINGS,
  normalizeSectionId,
  normalizeSettings,
  sanitizeSectionId,
  type Settings,
} from "@/lib/settings";

type SQLiteRunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

type SQLiteStatement = {
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
  run(...params: unknown[]): SQLiteRunResult;
};

type SQLiteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SQLiteStatement;
};

type SQLiteModule = {
  DatabaseSync: new (filename: string) => SQLiteDatabase;
};

let cachedSqliteModule: SQLiteModule | null = null;

function loadSqliteModule(): SQLiteModule {
  if (cachedSqliteModule) {
    return cachedSqliteModule;
  }

  const processAny = process as unknown as {
    getBuiltinModule?: (id: string) => unknown;
  };

  const fromBuiltin =
    processAny.getBuiltinModule?.("node:sqlite") ||
    processAny.getBuiltinModule?.("sqlite");

  if (fromBuiltin && typeof fromBuiltin === "object" && "DatabaseSync" in (fromBuiltin as object)) {
    cachedSqliteModule = fromBuiltin as SQLiteModule;
    return cachedSqliteModule;
  }

  // Use eval so bundlers do not statically transform this as CommonJS external.
  const dynamicRequire = (0, eval)("require") as NodeRequire;
  const loaded = dynamicRequire("node:sqlite") as SQLiteModule;
  cachedSqliteModule = loaded;
  return loaded;
}

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "search.sqlite");
const LEGACY_SETTINGS_PATH = path.join(process.cwd(), "public", "setting.json");
const PUBLIC_DATA_DIR = path.join(process.cwd(), "public", "data");
const LEGACY_MIGRATION_KEY = "legacy_json_migrated_v1";
const LEGACY_SEED_SECTIONS_CLEANUP_KEY = "legacy_seed_sections_cleanup_v1";
const LEGACY_SEED_SECTION_IDS = ["libros", "curriculum"] as const;

type StoredDocument = {
  sectionId: string;
  id: string;
  nombre: string;
  ruta: string;
  metadata?: Record<string, MetadataValue | undefined>;
  maestro?: string;
  paginas?: number | string;
  precio?: number | string;
  universidad?: string;
};

type SearchStat = {
  query: string;
  count: number;
  lastSearched: number;
};

type ListDocumentsPageOptions = {
  sectionIdRaw?: string | null;
  query?: string | null;
  extensions?: string[] | null;
  page?: number | null;
  pageSize?: number | null;
};

type ListDocumentsPageResult = {
  sectionId: string;
  documents: StoredDocument[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type ReplaceDocumentsInput = {
  nombre: string;
  ruta: string;
};

type LegacyDocumentRecord = {
  id?: string | number;
  nombre?: string;
  ruta?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

declare global {
  var __searchDb: SQLiteDatabase | undefined;
}

function now() {
  return Date.now();
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readJsonFile(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function normalizeMetadataMap(input: unknown): MetadataByDocumentId {
  if (!input || typeof input !== "object") return {};

  const withMaybeWrapper = input as Record<string, unknown>;
  const rawMap =
    "metadataByDocumentId" in withMaybeWrapper
      ? withMaybeWrapper.metadataByDocumentId
      : withMaybeWrapper;

  if (!rawMap || typeof rawMap !== "object") return {};

  const normalized: MetadataByDocumentId = {};
  Object.entries(rawMap as Record<string, unknown>).forEach(([documentId, metadata]) => {
    if (!documentId || typeof metadata !== "object" || metadata === null) return;
    normalized[documentId] = cleanMetadata(metadata as Record<string, unknown>);
  });

  return normalized;
}

function normalizeForId(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").trim().toLowerCase();
}

function getLegacyDefaultUrls(sectionId: string) {
  const safeSectionId = normalizeSectionId(sectionId);
  if (safeSectionId === "default") {
    return {
      documentsUrl: "/data/documents.json",
      metadataUrl: "/data/documents-metadata.json",
      statsUrl: "/data/search-stats.json",
    };
  }

  return {
    documentsUrl: `/data/documents-${safeSectionId}.json`,
    metadataUrl: `/data/documents-metadata-${safeSectionId}.json`,
    statsUrl: `/data/search-stats-${safeSectionId}.json`,
  };
}

function resolveLegacyPublicPath(relativeUrl: string | undefined, fallbackFileName: string) {
  if (typeof relativeUrl === "string") {
    const trimmed = relativeUrl.trim();
    if (trimmed.startsWith("/data/") && trimmed.endsWith(".json")) {
      return path.join(process.cwd(), "public", trimmed.replace(/^\//, ""));
    }
  }

  return path.join(PUBLIC_DATA_DIR, fallbackFileName);
}

function getMetaValue(db: SQLiteDatabase, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key);
  const value = row?.value;
  return typeof value === "string" ? value : null;
}

function setMetaValue(db: SQLiteDatabase, key: string, value: string) {
  db.prepare(
    `INSERT INTO app_meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

function normalizeDocumentIdInput(documentId: unknown): string | null {
  if (typeof documentId === "string" && documentId.trim()) {
    return documentId.trim();
  }

  if (typeof documentId === "number" && Number.isFinite(documentId)) {
    return String(documentId);
  }

  return null;
}

function escapeLikeValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function normalizeExtensionsInput(raw: string[] | null | undefined) {
  if (!Array.isArray(raw)) return [];

  const normalized = raw
    .filter((item) => typeof item === "string")
    .map((item) => item.toLowerCase().trim().replace(/^\./, ""))
    .filter((item) => /^[a-z0-9]+$/.test(item));

  return Array.from(new Set(normalized));
}

function toSafePositiveInt(value: number | null | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  const floored = Math.floor(value as number);
  if (floored <= 0) return fallback;
  return Math.min(floored, max);
}

function toSafeCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === "bigint") {
    const asNumber = Number(value.toString());
    if (Number.isFinite(asNumber)) {
      return Math.max(0, Math.floor(asNumber));
    }
    return 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

function saveSettingsInternal(db: SQLiteDatabase, settings: Settings) {
  const payload = JSON.stringify(settings);
  db.prepare(
    `INSERT INTO app_settings(id, settings_json, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE
     SET settings_json = excluded.settings_json,
         updated_at = excluded.updated_at`
  ).run(payload, now());
}

function getSettingsInternal(db: SQLiteDatabase): Settings {
  const row = db.prepare("SELECT settings_json FROM app_settings WHERE id = 1").get();
  const json = row?.settings_json;

  if (typeof json !== "string") {
    const normalized = normalizeSettings(DEFAULT_SETTINGS);
    saveSettingsInternal(db, normalized);
    return normalized;
  }

  const parsed = parseJson(json, DEFAULT_SETTINGS);
  const normalized = normalizeSettings(parsed);
  return normalized;
}

function collectSectionIds(settings: Settings) {
  const ids = new Set<string>();

  settings.sections.forEach((section) => {
    const sectionId = normalizeSectionId(section.id);
    if (!sectionId) return;
    ids.add(sectionId);
  });

  return ids;
}

function deleteSectionDataInternal(db: SQLiteDatabase, sectionIdRaw: string) {
  const sectionId = normalizeSectionId(sectionIdRaw);
  if (!sectionId || sectionId === "default") return;

  db.prepare("DELETE FROM document_metadata WHERE section_id = ?").run(sectionId);
  db.prepare("DELETE FROM documents WHERE section_id = ?").run(sectionId);
  db.prepare("DELETE FROM search_stats WHERE section_id = ?").run(sectionId);
}

function mergeLegacyMetadataForDocument(
  document: LegacyDocumentRecord,
  externalMetadataMap: MetadataByDocumentId
) {
  const inlineMetadata = extractInlineMetadata(document as { id: string | number; [key: string]: unknown });
  const external =
    document.id !== undefined ? cleanMetadata(externalMetadataMap[String(document.id)] || {}) : {};

  return { ...inlineMetadata, ...external };
}

function runInTransactionWithDb<T>(db: SQLiteDatabase, work: () => T): T {
  db.exec("BEGIN IMMEDIATE TRANSACTION;");

  try {
    const result = work();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

function migrateLegacyDocumentsAndMetadata(
  db: SQLiteDatabase,
  sectionId: string,
  documentsFilePath: string,
  metadataFilePath: string
) {
  const parsedDocuments = readJsonFile(documentsFilePath);
  const documentsArray =
    parsedDocuments && typeof parsedDocuments === "object" && Array.isArray((parsedDocuments as { documents?: unknown[] }).documents)
      ? ((parsedDocuments as { documents?: unknown[] }).documents as LegacyDocumentRecord[])
      : [];

  if (documentsArray.length === 0) return;

  const parsedMetadata = readJsonFile(metadataFilePath);
  const externalMetadataMap = normalizeMetadataMap(parsedMetadata);

  const candidates = new Map<
    string,
    { nombre: string; ruta: string; metadata: Record<string, MetadataValue> }
  >();

  documentsArray.forEach((rawDocument) => {
    if (!rawDocument || typeof rawDocument !== "object") return;
    const nombre = typeof rawDocument.nombre === "string" ? rawDocument.nombre.trim() : "";
    const ruta = typeof rawDocument.ruta === "string" ? rawDocument.ruta.trim() : "";
    if (!nombre || !ruta) return;

    const documentId = createStableDocumentId(sectionId, nombre, ruta);
    const mergedMetadata = mergeLegacyMetadataForDocument(rawDocument, externalMetadataMap);

    const existing = candidates.get(documentId);
    if (!existing) {
      candidates.set(documentId, { nombre, ruta, metadata: mergedMetadata });
      return;
    }

    candidates.set(documentId, {
      nombre,
      ruta,
      metadata: {
        ...existing.metadata,
        ...mergedMetadata,
      },
    });
  });

  if (candidates.size === 0) return;

  runInTransactionWithDb(db, () => {
    const insertDocumentStatement = db.prepare(
      `INSERT OR REPLACE INTO documents(section_id, id, nombre, ruta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const upsertMetadataStatement = db.prepare(
      `INSERT INTO document_metadata(section_id, document_id, metadata_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(section_id, document_id) DO UPDATE
       SET metadata_json = excluded.metadata_json,
           updated_at = excluded.updated_at`
    );

    const timestamp = now();
    candidates.forEach((candidate, documentId) => {
      insertDocumentStatement.run(
        sectionId,
        documentId,
        candidate.nombre,
        candidate.ruta,
        timestamp,
        timestamp
      );

      if (Object.keys(candidate.metadata).length === 0) return;
      upsertMetadataStatement.run(
        sectionId,
        documentId,
        JSON.stringify(candidate.metadata),
        timestamp
      );
    });
  });
}

function migrateLegacySearchStats(db: SQLiteDatabase, sectionId: string, statsFilePath: string) {
  const parsed = readJsonFile(statsFilePath);
  if (!Array.isArray(parsed) || parsed.length === 0) return;

  const upsertStatement = db.prepare(
    `INSERT INTO search_stats(section_id, query_key, query, count, last_searched)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(section_id, query_key) DO UPDATE
     SET query = excluded.query,
         count = CASE
           WHEN excluded.count > search_stats.count THEN excluded.count
           ELSE search_stats.count
         END,
         last_searched = CASE
           WHEN excluded.last_searched > search_stats.last_searched THEN excluded.last_searched
           ELSE search_stats.last_searched
         END`
  );

  parsed.forEach((rawStat) => {
    if (!rawStat || typeof rawStat !== "object") return;
    const asRecord = rawStat as Record<string, unknown>;
    const query = typeof asRecord.query === "string" ? asRecord.query.trim() : "";
    if (!query) return;

    const count = typeof asRecord.count === "number" && Number.isFinite(asRecord.count) ? Math.max(1, Math.floor(asRecord.count)) : 1;
    const lastSearched =
      typeof asRecord.lastSearched === "number" && Number.isFinite(asRecord.lastSearched)
        ? Math.floor(asRecord.lastSearched)
        : now();

    upsertStatement.run(
      sectionId,
      query.toLowerCase(),
      query,
      count,
      lastSearched
    );
  });
}

function migrateLegacyJson(db: SQLiteDatabase) {
  const legacySettingsRaw = readJsonFile(LEGACY_SETTINGS_PATH);
  const settings = normalizeSettings(legacySettingsRaw || DEFAULT_SETTINGS);

  saveSettingsInternal(db, settings);

  const sectionInfo = new Map<
    string,
    {
      documentsPath: string;
      metadataPath: string;
      statsPath: string;
    }
  >();

  const defaultUrls = getLegacyDefaultUrls("default");
  sectionInfo.set("default", {
    documentsPath: resolveLegacyPublicPath(defaultUrls.documentsUrl, "documents.json"),
    metadataPath: resolveLegacyPublicPath(defaultUrls.metadataUrl, "documents-metadata.json"),
    statsPath: resolveLegacyPublicPath(defaultUrls.statsUrl, "search-stats.json"),
  });

  settings.sections.forEach((section) => {
    const sectionId = normalizeSectionId(section.id);
    const defaults = getLegacyDefaultUrls(sectionId);

    sectionInfo.set(sectionId, {
      documentsPath: resolveLegacyPublicPath(section.documentsPath, path.basename(defaults.documentsUrl)),
      metadataPath: resolveLegacyPublicPath(defaults.metadataUrl, path.basename(defaults.metadataUrl)),
      statsPath: resolveLegacyPublicPath(section.statsPath, path.basename(defaults.statsUrl)),
    });
  });

  sectionInfo.forEach((paths, sectionId) => {
    migrateLegacyDocumentsAndMetadata(db, sectionId, paths.documentsPath, paths.metadataPath);
    migrateLegacySearchStats(db, sectionId, paths.statsPath);
  });
}

function ensureSchema(db: SQLiteDatabase) {
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      section_id TEXT NOT NULL,
      id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      ruta TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (section_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_documents_section_nombre
    ON documents(section_id, nombre);

    CREATE INDEX IF NOT EXISTS idx_documents_section_ruta
    ON documents(section_id, ruta);

    CREATE TABLE IF NOT EXISTS document_metadata (
      section_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (section_id, document_id)
    );

    CREATE INDEX IF NOT EXISTS idx_document_metadata_section
    ON document_metadata(section_id);

    CREATE TABLE IF NOT EXISTS search_stats (
      section_id TEXT NOT NULL,
      query_key TEXT NOT NULL,
      query TEXT NOT NULL,
      count INTEGER NOT NULL,
      last_searched INTEGER NOT NULL,
      PRIMARY KEY (section_id, query_key)
    );

    CREATE INDEX IF NOT EXISTS idx_search_stats_section_count
    ON search_stats(section_id, count DESC);
  `);
}

function ensureDatabaseReady(db: SQLiteDatabase) {
  ensureSchema(db);

  const alreadyMigrated = getMetaValue(db, LEGACY_MIGRATION_KEY);
  if (alreadyMigrated !== "true") {
    migrateLegacyJson(db);
    setMetaValue(db, LEGACY_MIGRATION_KEY, "true");
  }

  const settingsRow = db.prepare("SELECT 1 AS present FROM app_settings WHERE id = 1").get();
  if (!settingsRow?.present) {
    saveSettingsInternal(db, normalizeSettings(DEFAULT_SETTINGS));
  }

  const seedCleanupDone = getMetaValue(db, LEGACY_SEED_SECTIONS_CLEANUP_KEY);
  if (seedCleanupDone !== "true") {
    cleanupLegacySeedSections(db);
    setMetaValue(db, LEGACY_SEED_SECTIONS_CLEANUP_KEY, "true");
  }
}

function cleanupLegacySeedSections(db: SQLiteDatabase) {
  if (fs.existsSync(LEGACY_SETTINGS_PATH)) return;

  const settings = getSettingsInternal(db);
  if (!Array.isArray(settings.sections) || settings.sections.length === 0) return;

  const legacySectionIds = new Set<string>(LEGACY_SEED_SECTION_IDS);
  const hasLegacySections = settings.sections.some((section) =>
    legacySectionIds.has(normalizeSectionId(section.id))
  );
  if (!hasLegacySections) return;

  const hasDocumentsInLegacySections = db
    .prepare(
      `SELECT 1 AS present
       FROM documents
       WHERE section_id IN (?, ?)
       LIMIT 1`
    )
    .get(LEGACY_SEED_SECTION_IDS[0], LEGACY_SEED_SECTION_IDS[1]);

  if (hasDocumentsInLegacySections?.present) return;

  const hasStatsInLegacySections = db
    .prepare(
      `SELECT 1 AS present
       FROM search_stats
       WHERE section_id IN (?, ?)
       LIMIT 1`
    )
    .get(LEGACY_SEED_SECTION_IDS[0], LEGACY_SEED_SECTION_IDS[1]);

  if (hasStatsInLegacySections?.present) return;

  const cleanedSections = settings.sections.filter((section) => {
    const sectionId = normalizeSectionId(section.id);
    const isLegacySeedSection = legacySectionIds.has(sectionId);
    if (!isLegacySeedSection) return true;

    const hasPaths = Array.isArray(section.indexPaths) && section.indexPaths.length > 0;
    return hasPaths;
  });

  if (cleanedSections.length === settings.sections.length) return;
  saveSettingsInternal(db, { ...settings, sections: cleanedSections });
}

export function getDb() {
  if (!globalThis.__searchDb) {
    const { DatabaseSync } = loadSqliteModule();
    fs.mkdirSync(DB_DIR, { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    ensureDatabaseReady(db);
    globalThis.__searchDb = db;
  }

  return globalThis.__searchDb;
}

export function runInTransaction<T>(work: () => T): T {
  const db = getDb();
  return runInTransactionWithDb(db, work);
}

export function createStableDocumentId(sectionIdRaw: string, nombre: string, ruta: string) {
  const sectionId = normalizeSectionId(sectionIdRaw);
  const normalizedNombre = normalizeForId(nombre);
  const normalizedRuta = normalizeForId(ruta);
  const key = `${sectionId}\n${normalizedNombre}\n${normalizedRuta}`;
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function getSettings() {
  const db = getDb();
  return getSettingsInternal(db);
}

export function saveSettings(rawSettings: unknown) {
  const db = getDb();
  const previous = getSettingsInternal(db);
  const normalized = normalizeSettings(rawSettings);

  const previousIds = collectSectionIds(previous);
  const nextIds = collectSectionIds(normalized);
  const removedSectionIds = Array.from(previousIds).filter(
    (sectionId) => !nextIds.has(sectionId) && sectionId !== "default"
  );

  runInTransactionWithDb(db, () => {
    saveSettingsInternal(db, normalized);
    removedSectionIds.forEach((sectionId) => {
      deleteSectionDataInternal(db, sectionId);
    });
  });

  return normalized;
}

function buildPathLookupCandidates(filePathRaw: string): string[] {
  const set = new Set<string>();

  const addVariants = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    set.add(trimmed);
    set.add(trimmed.replace(/\//g, "\\"));
    set.add(trimmed.replace(/\\/g, "/"));
  };

  addVariants(filePathRaw);

  try {
    addVariants(path.resolve(filePathRaw));
  } catch {
    // Ignore malformed inputs and keep raw candidates.
  }

  return Array.from(set);
}

export function isIndexedDocumentPath(filePathRaw: string) {
  if (typeof filePathRaw !== "string" || !filePathRaw.trim()) return false;

  const candidates = buildPathLookupCandidates(filePathRaw);
  if (candidates.length === 0) return false;

  const placeholders = candidates.map(() => "?").join(", ");
  const db = getDb();
  const row = db
    .prepare(`SELECT 1 AS present FROM documents WHERE ruta IN (${placeholders}) LIMIT 1`)
    .get(...candidates);

  return Boolean(row?.present);
}

function parseMetadataJson(rawJson: unknown): Record<string, unknown> {
  if (typeof rawJson !== "string" || !rawJson.trim()) return {};
  const parsed = parseJson(rawJson, {} as Record<string, unknown>);
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

function mapDocumentRow(row: Record<string, unknown>): StoredDocument {
  const base = {
    id: String(row.id || ""),
    nombre: String(row.nombre || ""),
    ruta: String(row.ruta || ""),
    sectionId: String(row.section_id || "default"),
  };

  const metadata = cleanMetadata(parseMetadataJson(row.metadata_json));
  return applyMetadataToDocument(base, metadata) as StoredDocument;
}

export function listDocuments(sectionIdRaw?: string | null) {
  const db = getDb();
  const sectionInput = typeof sectionIdRaw === "string" ? sectionIdRaw.trim().toLowerCase() : "";

  const queryBase = `
    SELECT d.section_id, d.id, d.nombre, d.ruta, m.metadata_json
    FROM documents d
    LEFT JOIN document_metadata m
      ON m.section_id = d.section_id
     AND m.document_id = d.id
  `;

  let rows: Array<Record<string, unknown>> = [];
  if (!sectionInput || sectionInput === "todos") {
    rows = db
      .prepare(`${queryBase} ORDER BY d.nombre COLLATE NOCASE ASC`)
      .all();
  } else {
    const sectionId = normalizeSectionId(sectionInput);
    rows = db
      .prepare(`${queryBase} WHERE d.section_id = ? ORDER BY d.nombre COLLATE NOCASE ASC`)
      .all(sectionId);
  }

  return rows.map(mapDocumentRow);
}

export function listDocumentsPage(options: ListDocumentsPageOptions): ListDocumentsPageResult {
  const db = getDb();
  const sectionId = normalizeSectionId(options.sectionIdRaw);
  const query = typeof options.query === "string" ? options.query.trim().toLowerCase() : "";
  const extensions = normalizeExtensionsInput(options.extensions);
  const pageSize = toSafePositiveInt(options.pageSize, 20, 500);
  const requestedPage = toSafePositiveInt(options.page, 1, 100000);

  const whereClauses = ["d.section_id = ?"];
  const params: unknown[] = [sectionId];

  if (query) {
    const escaped = `%${escapeLikeValue(query)}%`;
    whereClauses.push("(LOWER(d.nombre) LIKE ? ESCAPE '\\' OR LOWER(d.ruta) LIKE ? ESCAPE '\\')");
    params.push(escaped, escaped);
  }

  if (extensions.length > 0) {
    const placeholders = extensions.map(() => "?").join(", ");
    whereClauses.push(
      `CASE
         WHEN instr(d.nombre, '.') > 0 THEN lower(substr(d.nombre, instr(d.nombre, '.') + 1))
         ELSE ''
       END IN (${placeholders})`
    );
    params.push(...extensions);
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;

  const countRow = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM documents d
       ${whereSql}`
    )
    .get(...params);

  const total = toSafeCount(countRow?.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const rows = db
    .prepare(
      `SELECT d.section_id, d.id, d.nombre, d.ruta, m.metadata_json
       FROM documents d
       LEFT JOIN document_metadata m
         ON m.section_id = d.section_id
        AND m.document_id = d.id
       ${whereSql}
       ORDER BY d.nombre COLLATE NOCASE ASC
       LIMIT ?
       OFFSET ?`
    )
    .all(...params, pageSize, offset);

  return {
    sectionId,
    documents: rows.map(mapDocumentRow),
    total,
    page,
    pageSize,
    totalPages,
  };
}

export function getDocument(sectionIdRaw: string | null | undefined, documentIdRaw: unknown) {
  const documentId = normalizeDocumentIdInput(documentIdRaw);
  if (!documentId) return null;

  const db = getDb();
  const sectionId = normalizeSectionId(sectionIdRaw);

  const row = db
    .prepare(
      `SELECT d.section_id, d.id, d.nombre, d.ruta, m.metadata_json
       FROM documents d
       LEFT JOIN document_metadata m
         ON m.section_id = d.section_id
        AND m.document_id = d.id
       WHERE d.section_id = ?
         AND d.id = ?`
    )
    .get(sectionId, documentId);

  if (!row) return null;
  return mapDocumentRow(row);
}

export function getMetadataMap(sectionIdRaw?: string | null) {
  const db = getDb();
  const sectionId = normalizeSectionId(sectionIdRaw);

  const rows = db
    .prepare(
      `SELECT document_id, metadata_json
       FROM document_metadata
       WHERE section_id = ?`
    )
    .all(sectionId);

  const map: MetadataByDocumentId = {};
  rows.forEach((row) => {
    const key = String(row.document_id || "");
    if (!key) return;
    map[key] = cleanMetadata(parseMetadataJson(row.metadata_json));
  });

  return map;
}

export function documentExists(sectionIdRaw: string | null | undefined, documentIdRaw: unknown) {
  const documentId = normalizeDocumentIdInput(documentIdRaw);
  if (!documentId) return false;

  const db = getDb();
  const sectionId = normalizeSectionId(sectionIdRaw);

  const row = db
    .prepare(
      `SELECT 1 AS exists_flag
       FROM documents
       WHERE section_id = ?
         AND id = ?`
    )
    .get(sectionId, documentId);

  return !!row?.exists_flag;
}

export function saveDocumentMetadata(
  sectionIdRaw: string | null | undefined,
  documentIdRaw: unknown,
  metadataInput: Record<string, unknown> | null | undefined
) {
  const documentId = normalizeDocumentIdInput(documentIdRaw);
  if (!documentId) {
    throw new Error("documentId is required");
  }

  const sectionId = normalizeSectionId(sectionIdRaw);
  const metadata = cleanMetadata(metadataInput || {});
  const db = getDb();

  db.prepare(
    `INSERT INTO document_metadata(section_id, document_id, metadata_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(section_id, document_id) DO UPDATE
     SET metadata_json = excluded.metadata_json,
         updated_at = excluded.updated_at`
  ).run(sectionId, documentId, JSON.stringify(metadata), now());

  return {
    sectionId,
    documentId,
    metadata,
  };
}

function normalizeDocumentsForReplace(
  sectionIdRaw: string | null | undefined,
  documents: ReplaceDocumentsInput[]
) {
  const sectionId = normalizeSectionId(sectionIdRaw);
  const deduped = new Map<string, ReplaceDocumentsInput>();

  documents.forEach((rawDocument) => {
    if (!rawDocument || typeof rawDocument !== "object") return;
    const nombre = typeof rawDocument.nombre === "string" ? rawDocument.nombre.trim() : "";
    const ruta = typeof rawDocument.ruta === "string" ? rawDocument.ruta.trim() : "";
    if (!nombre || !ruta) return;

    const documentId = createStableDocumentId(sectionId, nombre, ruta);
    deduped.set(documentId, { nombre, ruta });
  });

  return {
    sectionId,
    documentsById: deduped,
  };
}

export function replaceDocumentsForSection(
  sectionIdRaw: string | null | undefined,
  documents: ReplaceDocumentsInput[]
) {
  const db = getDb();
  const { sectionId, documentsById } = normalizeDocumentsForReplace(sectionIdRaw, documents);

  runInTransaction(() => {
    db.prepare("DELETE FROM documents WHERE section_id = ?").run(sectionId);

    const insertStatement = db.prepare(
      `INSERT INTO documents(section_id, id, nombre, ruta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const timestamp = now();
    documentsById.forEach((document, documentId) => {
      insertStatement.run(sectionId, documentId, document.nombre, document.ruta, timestamp, timestamp);
    });
  });

  return {
    sectionId,
    count: documentsById.size,
  };
}

export function getTopSearches(sectionIdRaw?: string | null, limit: number = 5): SearchStat[] {
  const db = getDb();
  const sectionId = normalizeSectionId(sectionIdRaw);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 5;

  const rows = db
    .prepare(
      `SELECT query, count, last_searched
       FROM search_stats
       WHERE section_id = ?
       ORDER BY count DESC, last_searched DESC
       LIMIT ?`
    )
    .all(sectionId, safeLimit);

  return rows.map((row) => ({
    query: String(row.query || ""),
    count: typeof row.count === "number" ? row.count : 0,
    lastSearched: typeof row.last_searched === "number" ? row.last_searched : 0,
  }));
}

export function recordSearch(sectionIdRaw: string | null | undefined, queryRaw: unknown) {
  const query = typeof queryRaw === "string" ? queryRaw.trim() : "";
  if (!query) {
    throw new Error("Invalid query");
  }

  const sectionId = normalizeSectionId(sectionIdRaw);
  const queryKey = query.toLowerCase();
  const timestamp = now();

  const db = getDb();
  db.prepare(
    `INSERT INTO search_stats(section_id, query_key, query, count, last_searched)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(section_id, query_key) DO UPDATE
     SET query = excluded.query,
         count = search_stats.count + 1,
         last_searched = excluded.last_searched`
  ).run(sectionId, queryKey, query, timestamp);

  return {
    sectionId,
    query,
  };
}

export function normalizeSectionInput(sectionIdRaw: string | null | undefined) {
  return normalizeSectionId(sectionIdRaw);
}

export function sanitizeSectionInput(sectionIdRaw: string | null | undefined) {
  return sanitizeSectionId(sectionIdRaw || "");
}

export function normalizeDocumentId(sectionIdRaw: string | null | undefined, documentIdRaw: unknown) {
  const sectionId = normalizeSectionId(sectionIdRaw);
  const documentId = normalizeDocumentIdInput(documentIdRaw);
  if (!documentId) return null;

  return {
    sectionId,
    documentId,
  };
}
