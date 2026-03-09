import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/lib/auth/schema";

const AUTH_DATA_DIR = path.join(process.cwd(), "data");
const AUTH_DB_PATH = path.join(AUTH_DATA_DIR, "auth.db");

declare global {
  var __authSqlite: Database.Database | undefined;
}

const sqlite = globalThis.__authSqlite ?? (() => {
  fs.mkdirSync(AUTH_DATA_DIR, { recursive: true });
  return new Database(AUTH_DB_PATH);
})();

if (!globalThis.__authSqlite) {
  globalThis.__authSqlite = sqlite;
}

export const authSqlite = sqlite;
export const authDb = drizzle(authSqlite, { schema });
