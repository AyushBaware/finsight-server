import { Router } from "express"
import { getAdminFirestore } from "../services/firebaseAdmin.js"

const router = Router()

// Maps investment horizon (in months) to appropriate fund categories.
// This is standard, textbook financial-planning logic — not personalized
// advice — and is intentionally simple and explainable.
const resolveCategoriesForHorizon = (horizonMonths) => {
  if (horizonMonths <= 12) return ["liquid", "debt"]
  if (horizonMonths <= 36) return ["hybrid", "debt"]
  return ["equity", "index", "elss"]
}

// Builds a real, working deep link to a third-party platform where the user
// can actually go execute the investment. FinSight never takes custody of
// money or executes trades — this is a deliberate architectural choice, not
// a missing feature. Kuvera supports direct ISIN-based search links.
const buildDeepLink = (fund) => {
  if (fund.isinGrowth) {
    return `https://kuvera.in/mutual-funds/search?query=${encodeURIComponent(fund.isinGrowth)}`
  }
  return `https://kuvera.in/mutual-funds/search?query=${encodeURIComponent(fund.schemeName)}`
}

/**
 * GET /api/funds?horizonMonths=24&risk=medium
 *
 * Returns a small set of REAL funds (real names, real live-cached NAV) whose
 * category matches the requested time horizon. This is informational
 * category-matching, not personalized investment advice — every response
 * carries an explicit disclaimer, and the client is responsible for
 * displaying it prominently.
 */
router.get("/funds", async (req, res) => {
  try {
    const horizonMonths = Number.parseInt(req.query.horizonMonths, 10)

    if (!Number.isFinite(horizonMonths) || horizonMonths <= 0) {
      return res.status(400).json({
        error: "Provide a valid 'horizonMonths' query parameter (a positive integer).",
      })
    }

    const categories = resolveCategoriesForHorizon(horizonMonths)
    const db = getAdminFirestore()

    const snapshots = await Promise.all(
      categories.map((category) =>
        db.collection("funds").where("category", "==", category).limit(5).get(),
      ),
    )

    const funds = snapshots.flatMap((snapshot) =>
      snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          schemeCode: data.schemeCode,
          schemeName: data.schemeName,
          category: data.category,
          nav: data.nav,
          navDate: data.navDate,
          deepLink: buildDeepLink(data),
        }
      }),
    )

    return res.json({
      horizonMonths,
      matchedCategories: categories,
      funds,
      disclaimer:
        "Informational only, not personalized investment advice. Fund categories are matched " +
        "using standard time-horizon guidelines. Verify all details independently before investing. " +
        "FinSight does not execute trades or hold your money — you invest directly through the linked platform.",
    })
  } catch (error) {
    console.error("[GET /api/funds] Failed:", error)
    return res.status(500).json({ error: "Could not fetch fund data right now." })
  }
})

export default router