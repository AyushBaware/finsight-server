// Parses AMFI India's daily NAV feed (https://www.amfiindia.com/spages/NAVAll.txt)
// into structured records we can store and query.
//
// The raw file looks roughly like this (semicolon-delimited), with category
// and AMC name header lines interspersed that do NOT have semicolons:
//
//   Open Ended Schemes(Debt Scheme - Liquid Fund)
//
//   Aditya Birla Sun Life Mutual Fund
//   Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
//   103311;INF209K01UN8;-;Aditya Birla Sun Life Liquid Fund-Growth;123.4567;30-Jun-2026
//   ...
//
// We track the most recent "Open Ended Schemes(...)" header as the current
// raw category, tag each fund row with it, and also map it down to a small,
// simplified taxonomy that the investment-matching logic can reason about
// without needing to understand AMFI's full scheme classification list.

const CATEGORY_HEADER_PATTERN = /open ended schemes\s*\((.+)\)/i

const SIMPLIFIED_CATEGORY_RULES = [
  { tag: "liquid", pattern: /liquid|overnight|ultra short/i },
  { tag: "debt", pattern: /debt|gilt|corporate bond|banking and psu/i },
  { tag: "hybrid", pattern: /hybrid|balanced/i },
  { tag: "index", pattern: /index|etf/i },
  { tag: "elss", pattern: /elss|tax saving/i },
  { tag: "equity", pattern: /equity/i },
]

const simplifyCategory = (rawCategory = "") => {
  const match = SIMPLIFIED_CATEGORY_RULES.find(({ pattern }) => pattern.test(rawCategory))
  return match ? match.tag : "other"
}

const isFundDataLine = (line) => {
  // Fund rows have exactly 5 semicolons (6 fields) and start with a numeric
  // scheme code. Header/AMC-name lines don't match this shape.
  const parts = line.split(";")
  return parts.length === 6 && /^\d+$/.test(parts[0].trim())
}

export const parseAmfiNavText = (rawText) => {
  const lines = rawText.split(/\r?\n/)
  const funds = []
  let currentRawCategory = "Unclassified"

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const headerMatch = trimmed.match(CATEGORY_HEADER_PATTERN)
    if (headerMatch) {
      currentRawCategory = headerMatch[1].trim()
      continue
    }

    if (!isFundDataLine(trimmed)) {
      // AMC name line, column-header line, or anything else we don't need.
      continue
    }

    const [schemeCode, isinGrowth, isinReinvestment, schemeName, navValue, navDate] =
      trimmed.split(";").map((field) => field.trim())

    const nav = Number.parseFloat(navValue)
    if (!schemeName || !Number.isFinite(nav)) continue

    funds.push({
      schemeCode,
      isinGrowth: isinGrowth !== "-" ? isinGrowth : null,
      isinReinvestment: isinReinvestment !== "-" ? isinReinvestment : null,
      schemeName,
      nav,
      navDate,
      rawCategory: currentRawCategory,
      category: simplifyCategory(currentRawCategory),
    })
  }

  return funds
}