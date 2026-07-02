import { Router } from "express"
import { runAmfiIngestion } from "../jobs/ingestAmfiNav.js"

const router = Router()

// Protected by a shared secret (NOT Firebase auth — this is a server-to-server
// trigger, called by an external scheduler like cron-job.org, not by the
// frontend or a logged-in user). Set ADMIN_INGEST_SECRET in your env and
// configure your external scheduler to send it as a header.
router.post("/ingest-funds", async (req, res) => {
  const providedSecret = req.get("x-admin-secret")

  if (!process.env.ADMIN_INGEST_SECRET) {
    return res.status(500).json({ error: "ADMIN_INGEST_SECRET is not configured on the server." })
  }

  if (providedSecret !== process.env.ADMIN_INGEST_SECRET) {
    return res.status(401).json({ error: "Unauthorized." })
  }

  try {
    const result = await runAmfiIngestion()
    return res.json({ status: "ok", ...result })
  } catch (error) {
    console.error("[POST /api/admin/ingest-funds] Failed:", error)
    return res.status(500).json({ error: "Ingestion failed." })
  }
})

export default router