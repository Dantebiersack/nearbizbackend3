import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.route.js";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);

export default app;
