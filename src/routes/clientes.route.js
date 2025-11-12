// src/routes/clientes.route.js
const { Router } = require("express");
const db = require("../db");
const router = Router();

const mapCliente = (c) => ({
  IdCliente: c.id_cliente,
  IdUsuario: c.id_usuario,
  Estado: c.estado,
});

router.get("/", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "false") === "true";
    const q = includeInactive
      ? `SELECT * FROM "Clientes" ORDER BY "id_cliente"`
      : `SELECT * FROM "Clientes" WHERE "estado"=TRUE ORDER BY "id_cliente"`;
    const { rows } = await db.query(q);
    res.json(rows.map(mapCliente));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM "Clientes" WHERE "id_cliente"=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    res.json(mapCliente(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.post("/", async (req, res) => {
  try {
    const { idUsuario } = req.body;
    const { rows } = await db.query(
      `INSERT INTO "Clientes" ("id_usuario","estado")
       VALUES ($1,TRUE) RETURNING *`,
      [idUsuario]
    );
    res.status(201).json(mapCliente(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.put("/:id", async (req, res) => {
  try {
    const { idUsuario } = req.body;
    const { rowCount } = await db.query(
      `UPDATE "Clientes" SET "id_usuario"=$1 WHERE "id_cliente"=$2`,
      [idUsuario, req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE "Clientes" SET "estado"=FALSE WHERE "id_cliente"=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.patch("/:id/restore", async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE "Clientes" SET "estado"=TRUE WHERE "id_cliente"=$1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

module.exports = router;
