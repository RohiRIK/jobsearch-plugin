/** Recruiter-facing presentation only; never mutate the evidence/profile. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return value;
  if (!match[3]) return `${MONTHS[month - 1]} ${match[1]}`;
  const day = Number(match[3]);
  const date = new Date(`${value}T00:00:00Z`);
  if (!day || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
  return `${day} ${MONTHS[month - 1]} ${match[1]}`;
}

/** Remove only the standalone environment badge, never scope limitations. */
export function displaySkill(value: string): string {
  return value.replace(/\s+\(production\)\s*$/i, "").trim();
}

export function displayDateRange(start?: string, end?: string): string {
  return [start && displayDate(start), end ? displayDate(end) : start ? "Present" : undefined].filter(Boolean).join(" – ");
}
