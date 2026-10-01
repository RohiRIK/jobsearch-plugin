import { describe, expect, test } from "bun:test"
import { parseJobCards, CATEGORIES, AREAS } from "../src/helpers.js"

// Matches real JobMaster HTML structure (simplified for testing)
const SAMPLE_JM_HTML = `
<html><body>
<article id="misra11674" class="CardStyle JobItem font14" tabindex="0">
  <div class="JobItemRight">
    <a class="CardHeader View_Job_Details" data-selector="View_Job_Details_11674" href="/jobs/checknum.asp?key=11674">
      מנהל/ת ייצור למפעל בתחום הריהוט
    </a>
    <div class="paddingTop10px">
      <span class="Gray">פורסם לפני 1 שעות</span>
    </div>
    ע"י
    <a tabindex="0" class="font14 CompanyNameLink" href="checkhevra.asp?cs=COMP123">
      <span>חברה טכנולוגית</span>
    </a>
    <ul>
      <li class="jobLocation"><span>תל אביב</span></li>
      <li class="jobType">משרה מלאה</li>
    </ul>
    <div class="jobShortDescription Gray">תיאור קצר של המשרה</div>
  </div>
</article>

<article id="misra11675" class="CardStyle JobItem font14" tabindex="0">
  <div class="JobItemRight">
    <a class="CardHeader View_Job_Details" data-selector="View_Job_Details_11675" href="/jobs/checknum.asp?key=11675">
      מזכירה אדמיניסטרציה וקבלת קהל
    </a>
    <div class="paddingTop10px">
      <span class="Gray">פורסם לפני 3 שעות</span>
    </div>
    ע"י
    <span class="font14 ByTitle">חסוי</span>
    <ul>
      <li class="jobLocation"><span>פתח תקווה</span></li>
    </ul>
  </div>
</article>

<article id="misra11679" class="CardStyle JobItem font14" tabindex="0">
  <div class="JobItemRight">
    <a class="CardHeader View_Job_Details" data-selector="View_Job_Details_11679" href="/jobs/checknum.asp?key=11679">
      נהג/עובד כללי
    </a>
    <div class="paddingTop10px">
      <span class="Gray">פורסם לפני יום</span>
    </div>
    ע"י
    <a tabindex="0" class="font14 CompanyNameLink" href="checkhevra.asp?cs=COUR456">
      <span>חברת שליחויות</span>
    </a>
    <ul>
      <li class="jobLocation"><span>מרכז</span></li>
      <li class="jobType">משרה חלקית</li>
    </ul>
  </div>
</article>
</body></html>
`

describe("parseJobCards", () => {
  test("extracts job cards", () => {
    const cards = parseJobCards(SAMPLE_JM_HTML)
    expect(cards.length).toBe(3)
  })
  test("extracts IDs", () => {
    const cards = parseJobCards(SAMPLE_JM_HTML)
    expect(cards[0].id).toBe("11674")
    expect(cards[1].id).toBe("11675")
    expect(cards[2].id).toBe("11679")
  })
  test("extracts titles", () => {
    const cards = parseJobCards(SAMPLE_JM_HTML)
    expect(cards[0].title).toContain("ייצור")
    expect(cards[1].title).toContain("מזכירה")
  })
  test("extracts companies", () => {
    const cards = parseJobCards(SAMPLE_JM_HTML)
    expect(cards[0].company).toContain("חברה טכנולוגית")
    expect(cards[1].company).toBe("חסוי")
    expect(cards[2].company).toContain("שליחויות")
  })
  test("extracts locations", () => {
    const cards = parseJobCards(SAMPLE_JM_HTML)
    expect(cards[0].location).toContain("תל אביב")
    expect(cards[1].location).toContain("פתח תקווה")
  })
  test("extracts dates", () => {
    const cards = parseJobCards(SAMPLE_JM_HTML)
    expect(cards[0].date).toContain("לפני")
  })
  test("builds correct URLs", () => {
    const cards = parseJobCards(SAMPLE_JM_HTML)
    expect(cards[0].url).toBe("https://www.jobmaster.co.il/jobs/checknum.asp?key=11674")
  })
  test("returns empty for no matches", () => {
    expect(parseJobCards("<html><body>nothing</body></html>").length).toBe(0)
  })
})

describe("constants", () => {
  test("CATEGORIES has software", () => { expect(CATEGORIES["software"]).toBeTruthy() })
  test("AREAS has tel aviv", () => { expect(AREAS["tel aviv"]).toBeTruthy() })
})
