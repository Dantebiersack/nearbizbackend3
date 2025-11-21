// src/routes/valoraciones.route.js
const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");
const { decodeJwt } = require("jose"); // necesario para leer el token

const router = Router();

/* ============================================================
   Helper: leer usuario desde el token
   ============================================================ */
function getUserFromAuthHeader(req) {
  const auth = req.headers.authorization || "";

  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return null;
  }

  const token = parts[1];
  const decoded = decodeJwt(token);

  if (!decoded || !decoded.sub || !decoded.rol) return null;

  return {
    idUsuario: Number(decoded.sub),
    rol: decoded.rol
  };
}

/* ============================================================
   GET valoraciones del negocio del usuario (/api/Valoraciones/MisValoraciones)
   ============================================================ */
router.get("/MisValoraciones", async (req, res) => {
  try {
    const auth = getUserFromAuthHeader(req);

    if (!auth) {
      return res.status(401).json({ message: "Token inválido o ausente" });
    }

    const { idUsuario, rol } = auth;

    // Solo adminNegocio puede ver estas valoraciones
    if (rol !== "adminNegocio") {
      return res.status(403).json({ message: "No tienes permiso" });
    }

    // 1️⃣ Buscar el negocio asociado al usuario
    const qNegocio = `
      SELECT id_negocio
      FROM "Personal"
      WHERE id_usuario = $1
      LIMIT 1;
    `;

    const negocioResult = await db.query(qNegocio, [idUsuario]);

    if (negocioResult.rowCount === 0) {
      return res.status(404).json({
        message: "Este usuario no pertenece a ningún negocio"
      });
    }

    const idNegocio = negocioResult.rows[0].id_negocio;

    // 2️⃣ Traer las valoraciones de ese negocio
    const q = `
      SELECT 
        v.id_valoracion,
        v.id_negocio,
        v.id_cliente,
        v.comentario,
        v.calificacion,
        v.fecha,
        u.nombre
      FROM "Valoraciones" v
      LEFT JOIN "Clientes" c ON c.id_cliente = v.id_cliente
      LEFT JOIN "Usuarios" u ON u.id_usuario = c.id_usuario
      WHERE v.id_negocio = $1
      ORDER BY v.fecha DESC;
    `;

    const { rows } = await db.query(q, [idNegocio]);

    const data = rows.map(r => ({
      IdValoracion: r.id_valoracion,
      IdNegocio: r.id_negocio,
      IdCliente: r.id_cliente,
      Comentario: r.comentario,
      Calificacion: r.calificacion,
      Fecha: r.fecha,
      NombreCliente: r.nombre || "Cliente desconocido"
    }));

    return res.json(data);

  } catch (e) {
    console.error("Error en MisValoraciones:", e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* ============================================================
   GET valoraciones por negocio (NO MODIFICADO)
   ============================================================ */
router.get("/Negocio/:idNegocio(\\d+)", async (req, res) => {
  try {
    const idNegocio = Number(req.params.idNegocio);

    const q = `
      SELECT 
        v.id_valoracion,
        v.id_negocio,
        v.id_cliente,
        v.comentario,
        v.calificacion,
        v.fecha,
        u.nombre
      FROM "Valoraciones" v
      LEFT JOIN "Clientes" c ON c.id_cliente = v.id_cliente
      LEFT JOIN "Usuarios" u ON u.id_usuario = c.id_usuario
      WHERE v.id_negocio = $1
      ORDER BY v.fecha DESC;
    `;

    const { rows } = await db.query(q, [idNegocio]);

    const data = rows.map(r => ({
      IdValoracion: r.id_valoracion,
      IdNegocio: r.id_negocio,
      IdCliente: r.id_cliente,
      Comentario: r.comentario,
      Calificacion: r.calificacion,
      Fecha: r.fecha,
      NombreCliente: r.nombre || "Cliente desconocido"
    }));

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* ============================================================
   GET todas las valoraciones (NO MODIFICADO)
   ============================================================ */
router.get("/", async (_req, res) => {
  try {
    const q = `
      SELECT 
        v.id_valoracion,
        v.id_negocio,
        v.id_cliente,
        v.comentario,
        v.calificacion,
        v.fecha,
        u.nombre
      FROM "Valoraciones" v
      LEFT JOIN "Clientes" c ON c.id_cliente = v.id_cliente
      LEFT JOIN "Usuarios" u ON u.id_usuario = c.id_usuario
      ORDER BY v.fecha DESC;
    `;

    const { rows } = await db.query(q);

    const data = rows.map(r => ({
      IdValoracion: r.id_valoracion,
      IdNegocio: r.id_negocio,
      IdCliente: r.id_cliente,
      Comentario: r.comentario,
      Calificacion: r.calificacion,
      Fecha: r.fecha,
      NombreCliente: r.nombre || "Cliente desconocido"
    }));

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* ============================================================
   POST crear valoración (NO MODIFICADO)
   ============================================================ */
router.post("/", async (req, res) => {
  try {
    const dto = req.body; // { IdNegocio, IdCliente, Comentario, Calificacion }

    const ins = await db.query(
      `INSERT INTO "Valoraciones"
       ("id_negocio","id_cliente","comentario","calificacion","fecha")
       VALUES($1,$2,$3,$4, NOW())
       RETURNING id_valoracion, id_negocio, id_cliente, comentario, calificacion, fecha;`,
      [dto.IdNegocio, dto.IdCliente, dto.Comentario || null, dto.Calificacion || null]
    );

    const r = ins.rows[0];

    // Obtener el nombre del cliente
    const { rows: userRows } = await db.query(
      `SELECT u.nombre
       FROM "Clientes" c
       LEFT JOIN "Usuarios" u ON u.id_usuario = c.id_usuario
       WHERE c.id_cliente = $1 LIMIT 1;`,
      [r.id_cliente]
    );

    const cliente = userRows[0] || {};
    const NombreCliente = cliente.nombre || "Cliente desconocido";

    const body = {
      IdValoracion: r.id_valoracion,
      IdNegocio: r.id_negocio,
      IdCliente: r.id_cliente,
      Comentario: r.comentario,
      Calificacion: r.calificacion,
      Fecha: r.fecha,
      NombreCliente
    };

    return created(res, `/api/Valoraciones/${r.id_valoracion}`, body);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* ============================================================
   POST responder valoración (NO MODIFICADO)
   ============================================================ */
router.post("/:idValoracion(\\d+)/respuesta", async (req, res) => {
  try {
    const id = Number(req.params.idValoracion);
    const { respuesta } = req.body;

    await db.query(
      `UPDATE "Valoraciones"
       SET "respuesta"=$1
       WHERE "id_valoracion"=$2;`,
      [respuesta || null, id]
    );

    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;
