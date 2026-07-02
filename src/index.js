import "dotenv/config"
import express from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import cron from "node-cron"

import fundsRouter from "./routes/funds.js"
import adminRouter from "./routes/admin.js"
import { runAmfiIngestion } from "./jobs/ingestAmfiNav.js"

const app = express()
const PORT = process.env.PORT || 4000

// Only your deployed frontend (and localhost during development) may call
// this API. Set ALLOWED_ORIGIN in production to your Vercel/Netlify URL.
const allowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  "http://localhost:5173", // Vite's default dev server port
].filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g. curl, the external cron pinger) with no origin.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error("Not allowed by CORS"))
    },
  }),
)

app.use(express.json())

// Basic protection against someone hammering the free-tier API and burning
// through your Firestore read quota.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use("/api", apiLimiter)

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() })
})

app.use("/api", fundsRouter)
app.use("/api/admin", adminRouter)

app.use((err, req, res, next) => {
  console.error("[Unhandled error]", err)
  res.status(500).json({ error: "Something went wrong." })
})

app.listen(PORT, () => {
  console.log(`[finsight-server] Listening on port ${PORT}`)
})

// In-process daily cron (04:00 IST). NOTE: on Render's free tier, web
// services spin down after inactivity, so this in-process schedule is a
// convenience for local/always-on environments, NOT a reliable production
// mechanism on its own. See BACKEND_SETUP_GUIDE.md for the recommended
// production setup (external scheduler hitting /api/admin/ingest-funds).
if (process.env.ENABLE_IN_PROCESS_CRON === "true") {
  cron.schedule(
    "0 4 * * *",
    () => {
      console.log("[cron] Running scheduled AMFI ingestion...")
      runAmfiIngestion().catch((error) => {
        console.error("[cron] Scheduled ingestion failed:", error)
      })
    },
    { timezone: "Asia/Kolkata" },
  )
}