// src/app.js (CommonJS)
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.route");

const app = express();

// Middlewares
app.use(express.json());
app.use(morgan("dev"));
app.use(
  cors({
    origin: (process.env.ALLOW_ORIGIN || "*").split(","),
    credentials: false,
  })
);

// Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Rutas de tu API
app.use("/api/auth", authRoutes);

module.exports = app;
