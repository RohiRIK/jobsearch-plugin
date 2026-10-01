/**
 * The machine contract every `jobsearch` surface shares — CLI stdout and MCP
 * tool results carry the same envelope and the same error vocabulary.
 *
 * Changing an exit code, an error type, or an envelope field is a breaking
 * change: bump CONTRACT_VERSION and say so in the CHANGELOG.
 */

export const CONTRACT_VERSION = 2;

export const EXIT = {
  ok: 0,
  /** The command ran and its verdict is negative (review/gate failed). Data carries the detail. */
  verdictFailed: 1,
  usage: 2,
  notFound: 3,
  conflict: 5,
  dryRun: 10,
  external: 20,
  internal: 30,
} as const;

export type ErrorType =
  | "usage"
  | "validation"
  | "not_found"
  | "conflict"
  | "confirmation_required"
  | "unavailable"
  | "external"
  | "internal";

export const EXIT_FOR: Record<ErrorType, number> = {
  usage: EXIT.usage,
  validation: EXIT.usage,
  confirmation_required: EXIT.usage,
  not_found: EXIT.notFound,
  conflict: EXIT.conflict,
  unavailable: EXIT.external,
  external: EXIT.external,
  internal: EXIT.internal,
};

export const EXIT_TABLE: Record<string, string> = {
  "0": "ok",
  "1": "ran; verdict negative (review/gate) — see data",
  "2": "usage / validation / confirmation_required",
  "3": "not found",
  "5": "conflict / already exists",
  "10": "dry-run preview (nothing written)",
  "20": "external tool or dependency failed or unavailable",
  "30": "internal",
};

export class AgentError extends Error {
  constructor(
    readonly type: ErrorType,
    message: string,
    readonly suggestions: string[] = [],
    readonly recoverable = type !== "internal",
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface ErrorBody {
  code: number;
  type: ErrorType;
  message: string;
  recoverable: boolean;
  suggestions: string[];
  details?: unknown;
}

export type Envelope = { ok: true; data: unknown } | { ok: false; error: ErrorBody };

export function errorEnvelope(err: AgentError): { envelope: Envelope; exit: number } {
  const code = EXIT_FOR[err.type];
  const error: ErrorBody = { code, type: err.type, message: err.message, recoverable: err.recoverable, suggestions: err.suggestions };
  if (err.details !== undefined) error.details = err.details;
  return { envelope: { ok: false, error }, exit: code };
}

/** Normalise anything thrown into an AgentError. Unknown failures are internal — never reinterpreted as a policy outcome. */
export function toAgentError(err: unknown): AgentError {
  if (err instanceof AgentError) return err;
  return new AgentError("internal", err instanceof Error ? err.message : String(err), [], false);
}

// ─── Command specs ───────────────────────────────────────────────────────────

export interface FlagSpec {
  type: "string" | "boolean";
  description: string;
  required?: boolean;
  default?: string | boolean;
  /** Allowed values for a string flag (validated before the handler runs). */
  enum?: readonly string[];
}

export type Values = Record<string, string | boolean | undefined>;

export interface CommandResult {
  data: unknown;
  /** Override the exit code (dry-run → 10, negative verdict → 1). */
  exit?: number;
  /** For `output: "ndjson"` commands: one stdout line per row. */
  rows?: unknown[];
}

export interface CommandSpec {
  summary: string;
  /** Writes user state. Requires --yes; --dry-run previews and exits 10. */
  mutation: boolean;
  /** `stdio` commands own stdout (the MCP server) — no envelope is written. */
  output: "json" | "ndjson" | "stdio";
  /** Named MCP tool for high-traffic commands; others are reachable via jobsearch_run / jobsearch_write. */
  mcpTool?: string;
  /** Not offered over MCP (process-level commands such as `mcp` itself). */
  cliOnly?: boolean;
  flags: Record<string, FlagSpec>;
  run: (values: Values) => Promise<CommandResult>;
}

export function str(values: Values, key: string): string | undefined {
  const v = values[key];
  return typeof v === "string" ? v : undefined;
}

export function intFlag(value: string | undefined, name: string, fallback: number, min = 0): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min) {
    throw new AgentError("validation", `--${name} must be an integer >= ${min}, got ${JSON.stringify(value)}`);
  }
  return Number(value);
}

/**
 * The mutation gate. Call before any write: refuses without --yes or --dry-run,
 * returns true when the caller should only preview.
 */
export function confirmWrite(values: Values, command: string, retry: string): boolean {
  if (values["dry-run"] === true) return true;
  if (values.yes !== true) {
    throw new AgentError(
      "confirmation_required",
      `${command} writes user state; pass --yes after the user confirms, or --dry-run to preview`,
      [`${retry} --dry-run`],
    );
  }
  return false;
}

/** Keep only the named top-level fields (dot paths one level deep: `fit.score`). */
export function projectFields(data: unknown, fields: string[]): unknown {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return data;
  const src = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const [head, sub] = field.split(".", 2);
    if (!(head in src)) continue;
    if (sub === undefined) {
      out[head] = src[head];
    } else if (src[head] && typeof src[head] === "object" && sub in (src[head] as object)) {
      const existing = (out[head] ?? {}) as Record<string, unknown>;
      existing[sub] = (src[head] as Record<string, unknown>)[sub];
      out[head] = existing;
    }
  }
  return out;
}
