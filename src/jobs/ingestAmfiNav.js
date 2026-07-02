import axios from "axios"
import { getAdminFirestore } from "../services/firebaseAdmin.js"
import { parseAmfiNavText } from "../services/amfiParser.js"
import { pathToFileURL } from "node:url"

const AMFI_NAV_URL = "https://www.amfiindia.com/spages/NAVAll.txt"
const FUNDS_COLLECTION = "funds"
const MAX_FUNDS_PER_CATEGORY = 15

// We deliberately do NOT store all ~10,000+ schemes from the AMFI feed —
// that's far more than a leftover-money matcher needs, and it would burn
// through Firestore's free-tier write quota fast. Instead, per category we
// keep a small, well-known, direct-plan-growth-biased shortlist so the app
// always has clean, presentable options rather than a wall of near-duplicate
// schemes (a single AMC often lists 10+ nearly identical variants).
const preferDirectGrowthPlans = (funds) =>
  [...funds].sort((a, b) => {
    const aIsDirect = /direct/i.test(a.schemeName) ? 1 : 0
    const bIsDirect = /direct/i.test(b.schemeName) ? 1 : 0
    if (aIsDirect !== bIsDirect) return bIsDirect - aIsDirect

    const aIsGrowth = /growth/i.test(a.schemeName) ? 1 : 0
    const bIsGrowth = /growth/i.test(b.schemeName) ? 1 : 0
    return bIsGrowth - aIsGrowth
  })

export const runAmfiIngestion = async () => {
  console.log(`[ingestAmfiNav] Fetching ${AMFI_NAV_URL} ...`)
  const response = await axios.get(AMFI_NAV_URL, { responseType: "text", timeout: 30000 })
  const allFunds = parseAmfiNavText(response.data)
  console.log(`[ingestAmfiNav] Parsed ${allFunds.length} fund rows.`)

  const byCategory = allFunds.reduce((acc, fund) => {
    if (!acc[fund.category]) acc[fund.category] = []
    acc[fund.category].push(fund)
    return acc
  }, {})

  const db = getAdminFirestore()
  const batch = db.batch()
  const ingestedAt = new Date().toISOString()
  let totalWritten = 0

  for (const [category, funds] of Object.entries(byCategory)) {
    const shortlist = preferDirectGrowthPlans(funds).slice(0, MAX_FUNDS_PER_CATEGORY)

    for (const fund of shortlist) {
      const docRef = db.collection(FUNDS_COLLECTION).doc(fund.schemeCode)
      batch.set(docRef, { ...fund, ingestedAt }, { merge: true })
      totalWritten += 1
    }
  }

  await batch.commit()
  console.log(
    `[ingestAmfiNav] Wrote ${totalWritten} funds across ${Object.keys(byCategory).length} categories to Firestore.`,
  )

  return { totalParsed: allFunds.length, totalWritten, categories: Object.keys(byCategory) }
}

// Allows running this file directly for a manual/local ingestion:
//   npm run ingest
const isMainModule = import.meta.url === pathToFileURL(process.argv[1]).href
if (isMainModule) {
  const dotenv = await import("dotenv")
  dotenv.config()

  runAmfiIngestion()
    .then((result) => {
      console.log("[ingestAmfiNav] Done.", result)
      process.exit(0)
    })
    .catch((error) => {
      console.error("[ingestAmfiNav] Failed:", error)
      process.exit(1)
    })
}