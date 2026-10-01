import type { Experience } from "./profile-schemas.js";

/**
 * Candidate years that may support a technical role requirement.
 * Military service remains part of the candidate narrative, but does not count
 * as professional technical experience unless a future role-specific policy
 * deliberately says otherwise.
 */
export function professionalExperienceYears(experiences: Experience[] | undefined, currentYear = new Date().getFullYear()): number | null {
  const years = (experiences ?? [])
    .filter((experience) => experience.experienceType !== "military-service")
    .map((experience) => {
      const start = experience.startDate?.match(/\d{4}/)?.[0];
      if (!start) return 0;
      const endYear = experience.endDate?.match(/\d{4}/)?.[0];
      const end = endYear ? Number.parseInt(endYear, 10) : currentYear;
      return Math.max(0, end - Number.parseInt(start, 10));
    })
    .reduce((sum, value) => sum + value, 0);

  return years > 0 ? years : null;
}
