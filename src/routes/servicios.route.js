// src/routes/servicios.route.js
const { Router } = require("express");
const db = require("../db");
const router = Router();

const mapServicio = (s) => ({
  IdServicio: s.id_servicio,
  IdNegocio: s.id_negocio,
  NombreServicio: s.nombre_servicio,
  Descripcion: s.descripcion,
  Precio: Number(s.precio),
  DuracionMinutos: s.duracion_minutos,
  Estado: s.estado,
});

router.get("/", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "false") === "true";
    const idNegocio = req.query.idNegocio ? Number(req.query.idNegocio) : null;

    const cond = [];
    if (!includeInactive) cond.push(`"estado"=TRUE`);
    if (idNegocio) cond.push(`"id_negocio"=${idNegocio}`);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const { rows } = await db.query(
      `SELECT * FROM "Servicios" ${where} ORDER BY "id_servicio"`
    );
    res.json(rows.map(mapServicio));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM "Servicios" WHERE "id_servicio"=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    res.json(mapServicio(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.post("/", async (req, res) => {
  try {
    const { idNegocio, nombreServicio, descripcion, precio, duracionMinutos } = req.body;
    const { rows } = await db.query(
      `INSERT INTO "Servicios"
       ("id_negocio","nombre_servicio","descripcion","precio","duracion_minutos","estado")
       VALUES ($1,$2,$3,$4,$5,TRUE)
       RETURNING *`,
      [idNegocio, nombreServicio, descripcion || null, precio, duracionMinutos]
    );
    res.status(201).json(mapServicio(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { nombreServicio, descripcion, precio, duracionMinutos } = req.body;
    const { rowCount } = await db.query(
      `UPDATE "Servicios"
       SET "nombre_servicio"=$1,"descripcion"=$2,"precio"=$3,"duracion_minutos"=$4
       WHERE "id_servicio"=$5`,
      [nombreServicio, descripcion || null, precio, duracionMinutos, req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE "Servicios" SET "estado"=FALSE WHERE "id_servicio"=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.patch("/:id/restore", async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE "Servicios" SET "estado"=TRUE WHERE "id_servicio"=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

module.exports = router;
