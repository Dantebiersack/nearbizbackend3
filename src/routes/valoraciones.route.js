const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");

const router = Router();

/* -------------------------------------------
   NUEVA RUTA:
   GET /api/Valoraciones/Negocio/:idNegocio
   Para obtener SOLO las valoraciones de ese negocio
-------------------------------------------- */
router.get("/Negocio/:idNegocio", async (req, res) => {
  try {
    const idNegocio = Number(req.params.idNegocio);

    const { rows } = await db.query(
      `SELECT "id_valoracion","id_cita","id_cliente","id_negocio",
              "calificacion","comentario","fecha","estado"
       FROM "Valoraciones"
       WHERE "estado" = TRUE AND "id_negocio" = $1
       ORDER BY "fecha" DESC;`,
      [idNegocio]
    );

    const data = rows.map(v => ({
      IdValoracion: v.id_valoracion,
      IdCita: v.id_cita,
      IdCliente: v.id_cliente,
      IdNegocio: v.id_negocio,
      Calificacion: v.calificacion,
      Comentario: v.comentario,
      Fecha: v.fecha,
      Estado: v.estado
    }));

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* -------------------------------------------
   RUTA ORIGINAL GET /api/Valoraciones (opcional)
-------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    const idNegocio = req.query.idNegocio ? Number(req.query.idNegocio) : null;

    let q = `
      SELECT "id_valoracion","id_cita","id_cliente","id_negocio",
             "calificacion","comentario","fecha","estado"
      FROM "Valoraciones"
      WHERE 1 = 1
    `;

    const params = [];
    let index = 1;

    if (!includeInactive) {
      q += ` AND "estado" = TRUE `;
    }

    if (idNegocio) {
      q += ` AND "id_negocio" = $${index} `;
      params.push(idNegocio);
      index++;
    }

    q += ` ORDER BY "id_valoracion";`;

    const { rows } = await db.query(q, params);

    const data = rows.map(v => ({
      IdValoracion: v.id_valoracion,
      IdCita: v.id_cita,
      IdCliente: v.id_cliente,
      IdNegocio: v.id_negocio,
      Calificacion: v.calificacion,
      Comentario: v.comentario,
      Fecha: v.fecha,
      Estado: v.estado
    }));

    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* -------------------------------------------
   GET por id
-------------------------------------------- */
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `SELECT "id_valoracion","id_cita","id_cliente","id_negocio","calificacion","comentario","fecha","estado"
       FROM "Valoraciones" WHERE "id_valoracion"=$1;`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    const v = rows[0];
    return res.json({
      IdValoracion: v.id_valoracion,
      IdCita: v.id_cita,
      IdCliente: v.id_cliente,
      IdNegocio: v.id_negocio,
      Calificacion: v.calificacion,
      Comentario: v.comentario,
      Fecha: v.fecha,
      Estado: v.estado
    });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* -------------------------------------------
   POST crear
-------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const dto = req.body;
    const ins = await db.query(
      `INSERT INTO "Valoraciones"
        ("id_cita","id_cliente","id_negocio","calificacion","comentario","estado")
       VALUES ($1,$2,$3,$4,$5,TRUE)
       RETURNING "id_valoracion","id_cita","id_cliente","id_negocio","calificacion","comentario","fecha","estado";`,
      [dto.IdCita, dto.IdCliente, dto.IdNegocio, dto.Calificacion, dto.Comentario ?? null]
    );
    const v = ins.rows[0];
    return created(res, `/api/Valoraciones/${v.id_valoracion}`, {
      IdValoracion: v.id_valoracion,
      IdCita: v.id_cita,
      IdCliente: v.id_cliente,
      IdNegocio: v.id_negocio,
      Calificacion: v.calificacion,
      Comentario: v.comentario,
      Fecha: v.fecha,
      Estado: v.estado
    });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* -------------------------------------------
   PUT actualizar
-------------------------------------------- */
router.put("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dto = req.body;
    await db.query(
      `UPDATE "Valoraciones" SET "calificacion"=$1,"comentario"=$2 WHERE "id_valoracion"=$3;`,
      [dto.Calificacion, dto.Comentario ?? null, id]
    );
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* -------------------------------------------
   DELETE soft
-------------------------------------------- */
router.delete("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Valoraciones" SET "estado"=FALSE WHERE "id_valoracion"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

/* -------------------------------------------
   RESTORE
-------------------------------------------- */
router.patch("/:id(\\d+)/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Valoraciones" SET "estado"=TRUE WHERE "id_valoracion"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;
