import { describe, expect, test } from "bun:test";
import { normalizeStaging } from "../scripts/profile/merge.js";

describe("normalizeStaging", () => {
  test("maps flat github staging into identity + skills", () => {
    const result = normalizeStaging({
      name: "Jane Doe",
      email: "user@example.com",
      location: "Israel",
      blog: "https://example.com",
      bio: "IT engineer",
      linkedin: null,
      github: "https://github.com/RohiRIK",
      repos: [{ name: "x" }],
      languages: { TypeScript: 10, Shell: 5 },
    });
    expect(result.identity?.name).toBe("Jane Doe");
    expect(result.identity?.github).toBe("https://github.com/RohiRIK");
    expect(result.identity?.headline).toBe("IT engineer");
    expect(result.skills).toEqual([{ category: "Programming Languages", skills: ["TypeScript", "Shell"] }]);
  });

  test("passes through identity-shaped staging unchanged", () => {
    const entry = { identity: { name: "X" }, experience: [{ title: "Dev", company: "Acme" }] };
    expect(normalizeStaging(entry)).toBe(entry as never);
  });

  test("rejects non-http blog values", () => {
    const result = normalizeStaging({ github: "https://github.com/x", blog: "example.com", repos: [] });
    expect(result.identity?.blog).toBeUndefined();
  });

  test("empty strings become undefined", () => {
    const result = normalizeStaging({ github: "https://github.com/x", name: "", repos: [] });
    expect(result.identity?.name).toBeUndefined();
  });
});
