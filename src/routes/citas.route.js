// src/routes/citas.route.js
const { Router } = require("express");
const db = require("../db");
const router = Router();

const mapCita = (c) => ({
  IdCita: c.id_cita,
  IdCliente: c.id_cliente,
  IdTecnico: c.id_tecnico,
  IdServicio: c.id_servicio,
  FechaCita: c.fecha_cita,     // DATE
  HoraInicio: c.hora_inicio,   // TIME
  HoraFin: c.hora_fin,         // TIME
  Estado: c.estado,            // 'pendiente' | 'confirmada' | 'cancelada' ...
  MotivoCancelacion: c.motivo_cancelacion,
});

router.get("/", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "false") === "true";
    // Para Citas asumo "inactividad" = estado <> 'cancelada' ? Si tienes columna estado boolean, cámbialo.
    // Para mantener patrón, si no hay flag, no filtro por estado y muestro todas.
    const idCliente = req.query.idCliente ? Number(req.query.idCliente) : null;
    const idTecnico = req.query.idTecnico ? Number(req.query.idTecnico) : null;

    const cond = [];
    if (!includeInactive) cond.push(`"estado" <> 'cancelada'`);
    if (idCliente) cond.push(`"id_cliente" = ${idCliente}`);
    if (idTecnico) cond.push(`"id_tecnico" = ${idTecnico}`);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const { rows } = await db.query(
      `SELECT * FROM "Citas" ${where} ORDER BY "fecha_cita","hora_inicio"`
    );
    res.json(rows.map(mapCita));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM "Citas" WHERE "id_cita"=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    res.json(mapCita(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.post("/", async (req, res) => {
  try {
    const {
      idCliente, idTecnico, idServicio,
      fechaCita, horaInicio, horaFin, estado, motivoCancelacion
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO "Citas"
       ("id_cliente","id_tecnico","id_servicio","fecha_cita","hora_inicio","hora_fin","estado","motivo_cancelacion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        idCliente, idTecnico, idServicio,
        fechaCita, horaInicio, horaFin, estado || "pendiente", motivoCancelacion || null
      ]
    );
    res.status(201).json(mapCita(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.put("/:id", async (req, res) => {
  try {
    const {
      idCliente, idTecnico, idServicio,
      fechaCita, horaInicio, horaFin, estado, motivoCancelacion
    } = req.body;

    const { rowCount } = await db.query(
      `UPDATE "Citas"
       SET "id_cliente"=$1,"id_tecnico"=$2,"id_servicio"=$3,
           "fecha_cita"=$4,"hora_inicio"=$5,"hora_fin"=$6,
           "estado"=$7,"motivo_cancelacion"=$8
       WHERE "id_cita"=$9`,
      [
        idCliente, idTecnico, idServicio,
        fechaCita, horaInicio, horaFin, estado, motivoCancelacion || null,
        req.params.id
      ]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

/** Cancelación “soft”: dejamos todo igual pero estado='cancelada' y guardamos motivo */
router.patch("/:id/cancel", async (req, res) => {
  try {
    const { motivo } = req.body;
    const { rowCount } = await db.query(
      `UPDATE "Citas" SET "estado"='cancelada',"motivo_cancelacion"=$1 WHERE "id_cita"=$2`,
      [motivo || null, req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

module.exports = router;
