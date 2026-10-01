import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { WORKSPACE } from "./paths.js";
import {
  JobApplication,
  JobApplicationCreate,
  ApplicationStatus,
  generateApplicationId,
  computeContentHash,
} from "./schemas.js";

// TRACKER_DB lets tests point at an isolated database so they never contend
// with a concurrent CLI/MCP process on the shared data/tracker.db.
const DB_PATH = process.env.TRACKER_DB
  ? resolve(process.env.TRACKER_DB)
  : join(WORKSPACE, "data", "tracker.db");

// ─── Schema Initialization ──────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  company TEXT NOT NULL,
  sector TEXT,
  role TEXT NOT NULL,
  role_type TEXT,
  channel TEXT,
  status TEXT NOT NULL CHECK(status IN ('planning','applied','interviewing','offered','rejected','withdrawn','no_response')),
  contact_person TEXT,
  fit_rating INTEGER CHECK(fit_rating >= 0 AND fit_rating <= 100),
  notes TEXT,
  cv_file TEXT,
  cover_letter_file TEXT,
  source TEXT,
  content_hash TEXT UNIQUE,
  template_used TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_company ON applications(company);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_content_hash ON applications(content_hash);
CREATE INDEX IF NOT EXISTS idx_applications_date ON applications(date);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  template_used TEXT,
  language TEXT,
  company TEXT,
  role TEXT,
  application_id TEXT,
  reevaluation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_versions_company ON document_versions(company);
CREATE INDEX IF NOT EXISTS idx_document_versions_template ON document_versions(template_used);
`;

export interface DocumentVersion {
  id: number;
  file_path: string;
  template_used?: string;
  language?: string;
  company?: string;
  role?: string;
  reevaluation?: string;
  application_id?: string;
  created_at: string;
  application_status?: string;
}

// ─── Database Class ─────────────────────────────────────────────────────────

export class Tracker {
  private db: Database;

  get database(): Database {
    return this.db;
  }

  constructor(dbPath: string = DB_PATH) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    // Concurrent readers/writers (MCP server + CLI + tests) wait instead of failing on a held lock.
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec(SCHEMA);
    // Additive migration for DBs created before the reevaluation column existed.
    try {
      this.db.exec("ALTER TABLE document_versions ADD COLUMN reevaluation TEXT");
    } catch {
      /* column already exists */
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────

  list(filters?: { status?: string; company?: string }): JobApplication[] {
    let query = "SELECT * FROM applications";
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }
    if (filters?.company) {
      conditions.push("company LIKE ?");
      params.push(`%${filters.company}%`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY date DESC, created_at DESC";

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...(params as any[])) as Record<string, unknown>[];
    return rows.map((row) => this.parseRow(row));
  }

  get(id: string): JobApplication | null {
    const stmt = this.db.prepare("SELECT * FROM applications WHERE id = ?");
    const row = stmt.get(id) as Record<string, unknown> | null;
    return row ? this.parseRow(row) : null;
  }

  insert(data: JobApplicationCreate): JobApplication {
    const id = data.id || generateApplicationId(data.company);
    const now = new Date().toISOString();

    const contentHash =
      data.source
        ? computeContentHash(data.role, data.company, data.notes || "")
        : null;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO applications (
        id, date, company, sector, role, role_type, channel,
        status, contact_person, fit_rating, notes,
        cv_file, cover_letter_file, source, content_hash,
        template_used, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      data.date || new Date().toISOString().slice(0, 10),
      data.company,
      data.sector || null,
      data.role,
      data.role_type || null,
      data.channel || null,
      data.status,
      data.contact_person || null,
      data.fit_rating ?? null,
      data.notes || null,
      data.cv_file || null,
      data.cover_letter_file || null,
      data.source || null,
      contentHash,
      data.template_used || null,
      now,
      now
    );

    return this.get(id)!;
  }

  update(
    id: string,
    changes: Partial<Omit<JobApplication, "id" | "created_at">>
  ): JobApplication | null {
    const existing = this.get(id);
    if (!existing) return null;

    const ALLOWED_COLUMNS = new Set([
      "date", "company", "sector", "role", "role_type",
      "channel", "status", "contact_person", "fit_rating",
      "notes", "cv_file", "cover_letter_file", "source",
      "content_hash", "template_used"
    ]);

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(changes)) {
      if (key === "id" || key === "created_at") continue;
      if (!ALLOWED_COLUMNS.has(key)) throw new Error(`Unknown column: ${key}`);
      fields.push(`${key} = ?`);
      values.push(value ?? null);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = this.db.prepare(
      `UPDATE applications SET ${fields.join(", ")} WHERE id = ?`
    );
    stmt.run(...(values as any[]));

    return this.get(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM applications WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // ─── Queries ────────────────────────────────────────────────────────────

  findByHash(contentHash: string): JobApplication | null {
    const stmt = this.db.prepare(
      "SELECT * FROM applications WHERE content_hash = ?"
    );
    const row = stmt.get(contentHash) as Record<string, unknown> | null;
    return row ? this.parseRow(row) : null;
  }

  findBySource(url: string): JobApplication | null {
    const stmt = this.db.prepare(
      "SELECT * FROM applications WHERE source = ?"
    );
    const row = stmt.get(url) as Record<string, unknown> | null;
    return row ? this.parseRow(row) : null;
  }

  stats(): {
    total: number;
    by_status: Record<string, number>;
    by_company: Record<string, number>;
  } {
    const total = (
      this.db.prepare("SELECT COUNT(*) as count FROM applications").get() as {
        count: number;
      }
    ).count;

    const statusRows = this.db
      .prepare("SELECT status, COUNT(*) as count FROM applications GROUP BY status")
      .all() as { status: string; count: number }[];

    const companyRows = this.db
      .prepare("SELECT company, COUNT(*) as count FROM applications GROUP BY company ORDER BY count DESC")
      .all() as { company: string; count: number }[];

    return {
      total,
      by_status: Object.fromEntries(statusRows.map((r) => [r.status, r.count])),
      by_company: Object.fromEntries(companyRows.map((r) => [r.company, r.count])),
    };
  }

  // ─── Document Versions ──────────────────────────────────────────────────

  addDocumentVersion(entry: {
    file_path: string;
    template_used?: string;
    language?: string;
    company?: string;
    role?: string;
    application_id?: string;
    reevaluation?: string;
  }): DocumentVersion {
    const stmt = this.db.prepare(`
      INSERT INTO document_versions (file_path, template_used, language, company, role, application_id, reevaluation)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      entry.file_path,
      entry.template_used ?? null,
      entry.language ?? null,
      entry.company ?? null,
      entry.role ?? null,
      entry.application_id ?? null,
      entry.reevaluation ?? null
    );
    const row = this.db
      .prepare("SELECT * FROM document_versions WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as Record<string, unknown>;
    return this.cleanVersionRow(row);
  }

  listDocumentVersions(filters?: {
    template?: string;
    company?: string;
    outcome?: string;
  }): DocumentVersion[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.template) {
      conditions.push("dv.template_used = ?");
      params.push(filters.template);
    }
    if (filters?.company) {
      conditions.push("dv.company LIKE ?");
      params.push(`%${filters.company}%`);
    }
    if (filters?.outcome) {
      conditions.push("a.status = ?");
      params.push(filters.outcome);
    }

    let query = `
      SELECT dv.*, a.status AS application_status
      FROM document_versions dv
      LEFT JOIN applications a ON a.id = dv.application_id
    `;
    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY dv.created_at DESC";

    const rows = this.db.prepare(query).all(...(params as any[])) as Record<string, unknown>[];
    return rows.map((row) => this.cleanVersionRow(row));
  }

  private cleanVersionRow(row: Record<string, unknown>): DocumentVersion {
    return Object.fromEntries(
      Object.entries(row).filter(([, v]) => v !== null)
    ) as unknown as DocumentVersion;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private parseRow(row: Record<string, unknown>): JobApplication {
    // SQLite returns null for optional columns — convert to undefined for Zod
    const clean = Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, v === null ? undefined : v])
    );
    return JobApplication.parse(clean);
  }

  close(): void {
    this.db.close();
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: Tracker | null = null;

export function getTracker(): Tracker {
  if (!_instance) {
    _instance = new Tracker();
  }
  return _instance;
}

export function closeTracker(): void {
  if (_instance) {
    _instance.close();
    _instance = null;
  }
}
