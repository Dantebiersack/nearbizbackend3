require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.route");

const app = express();
app.use(express.json());
app.use(morgan("dev"));

app.use(
  cors({
    origin: process.env.ALLOW_ORIGIN?.split(",") ?? "*",
  })
);

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);

app.use((req, res) => res.status(404).json({ message: "Not found" }));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`NearBiz Node API listening http://localhost:${port}`);
});
