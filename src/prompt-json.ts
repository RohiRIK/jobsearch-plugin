/**
 * JSON for a prompt block. `<` is escaped as \u003c, which JSON reads back
 * as the same string, so a posting or draft value cannot close the tag the
 * block sits in ("</application_context>"; Sam, PR #18 @ 75b71b3).
 */
export function promptJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}
