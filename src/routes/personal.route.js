
const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");


const router = Router();


router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
  
    const idNegocio = req.query.idNegocio ? Number(req.query.idNegocio) : null;

 
    let q = `SELECT "id_personal", "id_usuario", "id_negocio", "rol_en_negocio", "fecha_registro", "estado" 
             FROM "Personal"`;
    
    const params = [];
    const whereClauses = [];

    if (!includeInactive) {
      whereClauses.push(`"estado" = TRUE`);
    }

    if (idNegocio) {
      params.push(idNegocio);
      whereClauses.push(`"id_negocio" = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      q += " WHERE " + whereClauses.join(" AND ");
    }
    
    q += ' ORDER BY "id_personal";';
    

    const { rows } = await db.query(q, params);

    
    const data = rows.map(r => ({
      IdPersonal: r.id_personal,
      IdUsuario: r.id_usuario,
      IdNegocio: r.id_negocio,
      RolEnNegocio: r.rol_en_negocio,
      FechaRegistro: r.fecha_registro,
      Estado: r.estado
    }));
    return res.json(data);

  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});


router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `SELECT "id_personal", "id_usuario", "id_negocio", "rol_en_negocio", "fecha_registro", "estado"
       FROM "Personal" WHERE "id_personal"=$1;`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    const r = rows[0];
    return res.json({
      IdPersonal: r.id_personal,
      IdUsuario: r.id_usuario,
      IdNegocio: r.id_negocio,
      RolEnNegocio: r.rol_en_negocio,
      FechaRegistro: r.fecha_registro,
      Estado: r.estado
    });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});


router.post("/", async (req, res) => {
  try {
    const dto = req.body; 
    const ins = await db.query(
      `INSERT INTO "Personal"("id_usuario", "id_negocio", "rol_en_negocio", "estado", "fecha_registro")
       VALUES($1, $2, $3, TRUE, CURRENT_TIMESTAMP)
       RETURNING "id_personal", "id_usuario", "id_negocio", "rol_en_negocio", "fecha_registro", "estado";`,
      [dto.IdUsuario, dto.IdNegocio, dto.RolEnNegocio]
    );
    const e = ins.rows[0];
    const body = {
      IdPersonal: e.id_personal,
      IdUsuario: e.id_usuario,
      IdNegocio: e.id_negocio,
      RolEnNegocio: e.rol_en_negocio,
      FechaRegistro: e.fecha_registro,
      Estado: e.estado
    };
    return created(res, `/api/Personal/${e.id_personal}`, body);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});


router.put("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dto = req.body; 
    await db.query(
      `UPDATE "Personal" SET "id_usuario"=$1, "id_negocio"=$2, "rol_en_negocio"=$3
       WHERE "id_personal"=$4;`,
      [dto.IdUsuario, dto.IdNegocio, dto.RolEnNegocio, id]
    );
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});


router.delete("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    
    
    const { rows } = await db.query('SELECT "id_usuario" FROM "Personal" WHERE "id_personal"=$1;', [id]);
    
    
    await db.query(`UPDATE "Personal" SET "estado"=FALSE WHERE "id_personal"=$1;`, [id]);

    
    if (rows.length) {
      const idUsuario = rows[0].id_usuario;
      await db.query(`UPDATE "Usuarios" SET "estado"=FALSE WHERE "id_usuario"=$1;`, [idUsuario]);
    }
    
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});


router.patch("/:id(\\d+)/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);


    const { rows } = await db.query('SELECT "id_usuario" FROM "Personal" WHERE "id_personal"=$1;', [id]);

    await db.query(`UPDATE "Personal" SET "estado"=TRUE WHERE "id_personal"=$1;`, [id]);
    
    
    if (rows.length) {
      const idUsuario = rows[0].id_usuario;
      await db.query(`UPDATE "Usuarios" SET "estado"=TRUE WHERE "id_usuario"=$1;`, [idUsuario]);
    }

    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;