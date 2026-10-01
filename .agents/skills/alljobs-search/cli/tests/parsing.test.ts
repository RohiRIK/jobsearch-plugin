import { describe, expect, test } from "bun:test"
import { parseJobCards, parseJobDetail, REGIONS, CATEGORIES } from "../src/helpers.js"

const SAMPLE_SEARCH_HTML = `
<html dir="RTL"><head><title>AllJobs</title></head>
<body>
<a href="/Search/UploadSingle.aspx?JobID=8547226">
  <h2>מפתח/ת בכיר/ה בתחום פיתוח דיגיטל</h2>
</a>
<a href="/Employer/HP/Default.aspx?cid=61904">וואן פתרונות טכנולוגיים בע"מ</a>
מיקום המשרה:
<a href="/SearchResultsGuest.aspx?city=779">תל אביב יפו</a>
סוג משרה:
<a href="/SearchResultsGuest.aspx?type=4">משרה מלאה</a>
לפני 1 שעות

<a href="/Search/UploadSingle.aspx?JobID=8707223">
  <h2>Software QA Engineer (Mobile Web)</h2>
</a>
<a href="/Employer/HP/Default.aspx?cid=81041">דיאלוג</a>
מיקום המשרה:
<a href="/SearchResultsGuest.aspx?city=779">תל אביב יפו</a>,
<a href="/SearchResultsGuest.aspx?city=712">הרצליה</a>
סוג משרה:
<a href="/SearchResultsGuest.aspx?type=4">משרה מלאה</a>
לפני 2 שעות

<a href="/Search/UploadSingle.aspx?JobID=8694047">
  <h2>בודק/ת תוכנה</h2>
</a>
<a href="/Employer/HP/Default.aspx?cid=121132">קורן טק טכנולוגיות</a>
מיקום המשרה:
<a href="/SearchResultsGuest.aspx?city=779">תל אביב יפו</a>
סוג משרה:
<a href="/SearchResultsGuest.aspx?type=4">משרה מלאה</a> ו<a href="/SearchResultsGuest.aspx?type=37">עבודה היברידית</a>
לפני 5 שעות
</body></html>
`

const SAMPLE_DETAIL_HTML = `
<html dir="RTL"><head><title>Job Detail</title></head>
<body>
<h2>מפתח/ת בכיר/ה בתחום פיתוח דיגיטל</h2>
<a href="/Employer/HP/Default.aspx?cid=61904">וואן פתרונות טכנולוגיים בע"מ</a>
מיקום המשרה: <a href="/SearchResultsGuest.aspx?city=779">תל אביב יפו</a>
סוג משרה: <a href="/SearchResultsGuest.aspx?type=4">משרה מלאה</a>

מתן פתרונות טכנולוגיים וארכיטקטוניים
דרישות:
לפחות 5 שנות ניסיון מוכח בפיתוח אתרי אינטרנט
לפחות 3 שנות ניסיון בפיתוח backend בטכנולוגיות .Net
</body></html>
`

describe("parseJobCards", () => {
  test("extracts job cards from search HTML", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards.length).toBe(3)
  })

  test("extracts job ID correctly", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[0].id).toBe("8547226")
    expect(cards[1].id).toBe("8707223")
    expect(cards[2].id).toBe("8694047")
  })

  test("extracts Hebrew titles", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[0].title).toContain("מפתח")
    expect(cards[2].title).toContain("בודק")
  })

  test("extracts English titles", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[1].title).toBe("Software QA Engineer (Mobile Web)")
  })

  test("extracts company names", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[0].company).toContain("וואן")
    expect(cards[1].company).toContain("לוג")
    expect(cards[2].company).toContain("קורן")
  })

  test("extracts company URLs", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[0].companyUrl).toContain("cid=61904")
  })

  test("extracts single location", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[0].location).toContain("תל אביב")
  })

  test("extracts multiple locations", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[1].location).toContain("תל אביב")
    expect(cards[1].location).toContain("הרצליה")
  })

  test("extracts job type", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[0].jobType).toContain("משרה מלאה")
  })

  test("extracts multiple job types", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[2].jobType).toContain("משרה מלאה")
    expect(cards[2].jobType).toContain("היברידית")
  })

  test("builds correct detail URLs", () => {
    const cards = parseJobCards(SAMPLE_SEARCH_HTML)
    expect(cards[0].url).toBe("https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=8547226")
  })

  test("returns empty array for no matches", () => {
    const cards = parseJobCards("<html><body>no jobs here</body></html>")
    expect(cards.length).toBe(0)
  })
})

describe("parseJobDetail", () => {
  test("extracts title from detail page", () => {
    const detail = parseJobDetail(SAMPLE_DETAIL_HTML, "8547226")
    expect(detail.title).toContain("מפתח")
  })

  test("extracts company from detail page", () => {
    const detail = parseJobDetail(SAMPLE_DETAIL_HTML, "8547226")
    expect(detail.company).toContain("וואן")
  })

  test("extracts location from detail page", () => {
    const detail = parseJobDetail(SAMPLE_DETAIL_HTML, "8547226")
    expect(detail.location).toContain("תל אביב")
  })

  test("splits description and requirements on dreishot", () => {
    const detail = parseJobDetail(SAMPLE_DETAIL_HTML, "8547226")
    expect(detail.description).toBeTruthy()
    expect(detail.requirements).toBeTruthy()
    expect(detail.requirements).toContain("5 שנות ניסיון")
  })

  test("returns correct id", () => {
    const detail = parseJobDetail(SAMPLE_DETAIL_HTML, "8547226")
    expect(detail.id).toBe("8547226")
  })
})

describe("constants", () => {
  test("REGIONS has tel aviv", () => {
    expect(REGIONS["tel aviv"]).toBe("2")
  })

  test("CATEGORIES has software", () => {
    expect(CATEGORIES["software"]).toBe("235")
  })

  test("CATEGORIES has python", () => {
    expect(CATEGORIES["python"]).toBe("1694")
  })
})
