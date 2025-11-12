// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./src/routes/auth.route");

const app = express();

app.use(express.json());
app.use(morgan("dev"));
allowOrigin = "*";
app.use(cors({
  origin: (() => {
    if (!allowOrigin) return false;           // bloquear si no se configuró
    if (allowOrigin === "*") return true;     // refleja el origin de la petición (sirve con credenciales)
    const list = allowOrigin.split(",").map(s => s.trim()).filter(Boolean);
    return list;
  })(),
  credentials: true, // pon true si vas a usar cookies/autorización; si no, puedes dejar false
}));

app.get("/api/health", (_, res) => res.json({ ok: true, env: process.env.NODE_ENV || "dev" }));

app.use("/api/auth", authRoutes);

// 404
app.use((req, res) => res.status(404).json({ message: "Not found" }));

module.exports = app;
