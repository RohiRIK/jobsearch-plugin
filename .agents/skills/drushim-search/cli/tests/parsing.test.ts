import { describe, expect, test } from "bun:test"
import { parseJobCards, CATEGORIES, AREAS } from "../src/helpers.js"

// Matches real Drushim HTML structure (simplified for testing)
const SAMPLE_DRUSHIM_HTML = `
<html><body>
<div data-cy="job-item1" class="flex job job-item">
  <div listingid="37370210" class="job-item-main pb-3">
    <h3 class="display-28">
      <span class="job-url primary--text font-weight-medium">מפתח/ת BACKEND</span>
    </h3>
    <a href="/job/37370210/ecc22f4c/" target="_blank">פתח</a>
    <p class="display-22">
      <a href="/דרושים-311679-logica-it/">
        <span class="font-weight-medium bidi">Logica-IT</span>
      </a>
    </p>
    <div class="flex nowrap">
      <span class="display-18"><span>תל אביב</span><span class="display-18 px-1">|</span></span>
    </div>
    <div class="flex nowrap">
      <span class="display-18">5-6 שנים</span><span class="display-18 px-1">|</span>
    </div>
    <div class="flex nowrap px-1">
      <div class="display-18">
        <span class="display-18 region-item"><span top="">משרה מלאה</span></span>
      </div>
    </div>
    <div class="flex shrink nowrap">
      <span class="display-18 px-1">|</span>
      <i class="v-icon mdi mdi-access-time"></i>
      <span class="display-18 inline-flex">לפני 1 שעות</span>
    </div>
  </div>
</div>

<div data-cy="job-item2" class="flex job job-item">
  <div listingid="37583466" class="job-item-main pb-3">
    <h3 class="display-28">
      <span class="job-url primary--text font-weight-medium">Integration &amp; DevOps Engineer</span>
    </h3>
    <a href="/job/37583466/43f17672/" target="_blank">פתח</a>
    <p class="display-22">
      <a href="/דרושים-1756-comm-it/">
        <span class="font-weight-medium bidi">Comm-IT</span>
      </a>
    </p>
    <div class="flex nowrap">
      <span class="display-18"><span>פתח תקווה</span><span class="display-18 px-1">|</span></span>
    </div>
    <div class="flex nowrap">
      <span class="display-18">3-4 שנים</span><span class="display-18 px-1">|</span>
    </div>
    <div class="flex shrink nowrap">
      <span class="display-18 inline-flex">לפני 2 שעות</span>
    </div>
  </div>
</div>

<div data-cy="job-item3" class="flex job job-item">
  <div listingid="37502184" class="job-item-main pb-3">
    <h3 class="display-28">
      <span class="job-url primary--text font-weight-medium">מהנדס/ת Generative AI</span>
    </h3>
    <a href="/job/37502184/49af5b25/" target="_blank">פתח</a>
    <p class="display-22">
      <a href="/דרושים-23181-בנק-לאומי/">
        <span class="font-weight-medium bidi">בנק לאומי</span>
      </a>
    </p>
    <div class="flex nowrap">
      <span class="display-18"><span>לוד</span><span class="display-18 px-1">|</span></span>
    </div>
    <div class="flex shrink nowrap">
      <span class="display-18 inline-flex">לפני 2 שעות</span>
    </div>
  </div>
</div>
</body></html>
`

describe("parseJobCards", () => {
  test("extracts job cards", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards.length).toBe(3)
  })
  test("extracts job IDs", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[0].id).toBe("37370210")
    expect(cards[1].id).toBe("37583466")
    expect(cards[2].id).toBe("37502184")
  })
  test("extracts Hebrew titles", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[0].title).toContain("BACKEND")
    expect(cards[2].title).toContain("Generative")
  })
  test("extracts English titles", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[1].title).toContain("DevOps")
  })
  test("extracts company names", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[0].company).toContain("Logica")
    expect(cards[1].company).toContain("Comm-IT")
    expect(cards[2].company).toContain("בנק")
  })
  test("extracts locations", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[0].location).toContain("תל אביב")
    expect(cards[1].location).toContain("פתח תקווה")
  })
  test("extracts experience", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[0].experience).toContain("5-6")
    expect(cards[1].experience).toContain("3-4")
  })
  test("extracts dates", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[0].date).toContain("לפני")
  })
  test("builds correct URLs", () => {
    const cards = parseJobCards(SAMPLE_DRUSHIM_HTML)
    expect(cards[0].url).toBe("https://www.drushim.co.il/job/37370210/")
  })
  test("returns empty for no matches", () => {
    expect(parseJobCards("<html><body>nothing</body></html>").length).toBe(0)
  })
})

describe("constants", () => {
  test("CATEGORIES has software=6", () => { expect(CATEGORIES["software"]).toBe("6") })
  test("AREAS has tel aviv=1", () => { expect(AREAS["tel aviv"]).toBe("1") })
})
