// src/app.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const authRoutes = require("./routes/auth.route");
const usuariosRoutes = require("./routes/usuarios.route");
const valoracionesRoutes = require("./routes/valoraciones.route");
const membresiasRoutes = require("./routes/membresias.route");

const clientesRoutes = require("./routes/clientes.route");
const serviciosRoutes = require("./routes/servicios.route");
const citasRoutes = require("./routes/citas.route");
const promocionesRoutes = require("./routes/promociones.route");

const app = express();

// ---------- CORS “siempre abierto” ----------
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || "*";
const ALLOW_HEADERS = "Content-Type, Authorization, X-Requested-With";
const ALLOW_METHODS = "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS";

// Si quieres abrir para todos (backend público)
if (ALLOW_ORIGIN === "*") {
  app.use(
    cors({
      origin: true,         // refleja el Origin recibido (o * en responses simples)
      credentials: false,   // si algún día usas cookies, ponlo en true y cambia origin
      methods: ALLOW_METHODS,
      allowedHeaders: ALLOW_HEADERS,
      preflightContinue: false,
      optionsSuccessStatus: 200, // algunos navegadores prefieren 200
    })
  );
} else {
  // Lista blanca separada por comas en ALLOW_ORIGIN
  const allowList = ALLOW_ORIGIN.split(",").map(s => s.trim());
  app.use(
    cors({
      origin: (origin, cb) => {
        // permitir herramientas como Postman (sin origin)
        if (!origin) return cb(null, true);
        return cb(null, allowList.includes(origin));
      },
      credentials: false,
      methods: ALLOW_METHODS,
      allowedHeaders: ALLOW_HEADERS,
      preflightContinue: false,
      optionsSuccessStatus: 200,
    })
  );
}

// MUY IMPORTANTE: responder preflight a TODO
app.options("*", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN === "*" ? "*" : (req.headers.origin || ""));
  res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
  res.setHeader("Access-Control-Max-Age", "86400");
  res.status(200).end();
});
// --------------------------------------------

app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/Usuarios", usuariosRoutes);
app.use("/api/Valoraciones", valoracionesRoutes);
app.use("/api/Membresias", membresiasRoutes);

app.use("/api/Clientes", clientesRoutes);
app.use("/api/Servicios", serviciosRoutes);
app.use("/api/Citas", citasRoutes);
app.use("/api/Promociones", promocionesRoutes);

// 404
app.use((req, res) => res.status(404).json({ message: "Not found" }));

module.exports = app;
