// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./src/routes/auth.route");

const app = express();

app.use(express.json());
app.use(morgan("dev"));

app.use(
  cors({
    origin: (origin, cb) => {
      const allow = process.env.ALLOW_ORIGIN
        ? process.env.ALLOW_ORIGIN.split(",").map(s => s.trim())
        : ["*"];
      if (allow.includes("*") || !origin || allow.includes(origin)) return cb(null, true);
      cb(new Error("CORS not allowed"));
    },
    credentials: true,
  })
);

app.get("/api/health", (_, res) => res.json({ ok: true, env: process.env.NODE_ENV || "dev" }));

app.use("/api/auth", authRoutes);

// 404
app.use((req, res) => res.status(404).json({ message: "Not found" }));

module.exports = app;
