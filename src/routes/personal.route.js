const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");
const { decodeJwt } = require("../utils/jwt"); 

const router = Router();

// --- Helper para extraer usuario del Token ---
function getUserFromAuthHeader(req) {
  const auth = req.headers.authorization || "";
  const parts = auth.split(" ");
  
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  
  const token = parts[1];
  const decoded = decodeJwt(token);
  
  if (!decoded || !decoded.payload) return null;
  
  const payload = decoded.payload;
  const idUsuario = Number(payload.sub);
  const rol = payload.rol;

  if (!idUsuario) return null;

  return { idUsuario, rol };
}

// --- Helper para obtener el ID Negocio del Admin ---
async function getMyBusinessId(idUsuario) {
  const res = await db.query(
    `SELECT "id_negocio" FROM "Personal" WHERE "id_usuario"=$1 LIMIT 1`,
    [idUsuario]
  );
  return res.rows.length ? res.rows[0].id_negocio : null;
}


// --- NUEVO ENDPOINT PARA MIRANDA---
router.get("/by-negocio/:idNegocio(\\d+)", async (req, res) => {
  try {
    const idNegocio = Number(req.params.idNegocio);
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";

    let q = `
      SELECT 
        p."id_personal", p."id_usuario", p."id_negocio", p."rol_en_negocio", 
        p."fecha_registro", p."estado",
        u."nombre" as nombre_usuario,
        u."email" as email_usuario
      FROM "Personal" p
      JOIN "Usuarios" u ON p."id_usuario" = u."id_usuario"
      WHERE p."id_negocio" = $1
    `;

    if (!includeInactive) {
      q += ` AND p."estado" = TRUE`;
    }
    
    q += ' ORDER BY p."id_personal";';

    const { rows } = await db.query(q, [idNegocio]);

    const data = rows.map(r => ({
      IdPersonal: r.id_personal,
      IdUsuario: r.id_usuario,
      IdNegocio: r.id_negocio,
      RolEnNegocio: r.rol_en_negocio,
      FechaRegistro: r.fecha_registro,
      Estado: r.estado,
      Nombre: r.nombre_usuario,
      Email: r.email_usuario
    }));

    return res.json(data);

  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});
// ---  FIN DEL ENDPOINT DE MIRANDA ---

// --- GET: Listar empleados (Seguro y Rápido con JOIN) ---
router.get("/", async (req, res) => {
  try {
    const user = getUserFromAuthHeader(req);
    if (!user) return res.status(401).json({ message: "Token inválido" });

    let targetIdNegocio = null;

    // 1. Determinar el Negocio
    if (user.rol === "adminNegocio" || user.rol === "personal") {
      targetIdNegocio = await getMyBusinessId(user.idUsuario);
      if (!targetIdNegocio) return res.json([]);
    } else if (user.rol === "adminNearbiz" && req.query.idNegocio) {
      targetIdNegocio = Number(req.query.idNegocio);
    } else {
      return res.status(403).json({ message: "Rol no autorizado" });
    }

    // 2. Query con JOIN a Usuarios
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    let q = `
      SELECT 
        p."id_personal", p."id_usuario", p."id_negocio", p."rol_en_negocio", 
        p."fecha_registro", p."estado",
        u."nombre" as nombre_usuario,
        u."email" as email_usuario
      FROM "Personal" p
      JOIN "Usuarios" u ON p."id_usuario" = u."id_usuario"
    `;
    
    const params = [];
    const whereClauses = [];

    if (!includeInactive) whereClauses.push(`p."estado" = TRUE`);
    
    if (targetIdNegocio) {
      params.push(targetIdNegocio);
      whereClauses.push(`p."id_negocio" = $${params.length}`);
    }

    if (whereClauses.length > 0) q += " WHERE " + whereClauses.join(" AND ");
    
    q += ' ORDER BY p."id_personal";';

    const { rows } = await db.query(q, params);

    const data = rows.map(r => ({
      IdPersonal: r.id_personal,
      IdUsuario: r.id_usuario,
      IdNegocio: r.id_negocio,
      RolEnNegocio: r.rol_en_negocio,
      FechaRegistro: r.fecha_registro,
      Estado: r.estado,
      Nombre: r.nombre_usuario,
      Email: r.email_usuario
    }));

    return res.json(data);

  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// --- POST create: Vincular empleado ---
router.post("/", async (req, res) => {
  try {
    const user = getUserFromAuthHeader(req);
    const dto = req.body; 
    
   
    let finalIdNegocio = dto.IdNegocio;

 
    if (user && user.rol === "adminNegocio") {
      const existingBusinessId = await getMyBusinessId(user.idUsuario);
      
      if (existingBusinessId) {
    
        finalIdNegocio = existingBusinessId;
      }
    
    }


    if (!finalIdNegocio) {
        return res.status(400).json({ message: "Error: No se proporcionó un ID de Negocio válido." });
    }

    const ins = await db.query(
      `INSERT INTO "Personal"("id_usuario", "id_negocio", "rol_en_negocio", "estado", "fecha_registro")
       VALUES($1, $2, $3, TRUE, CURRENT_TIMESTAMP)
       RETURNING "id_personal", "id_usuario", "id_negocio", "rol_en_negocio", "fecha_registro", "estado";`,
      [dto.IdUsuario, finalIdNegocio, dto.RolEnNegocio]
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

// --- PUT update ---
router.put("/:id(\\d+)", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const dto = req.body; 
      await db.query(
        `UPDATE "Personal" SET "rol_en_negocio"=$1 WHERE "id_personal"=$2;`,
        [dto.RolEnNegocio, id]
      );
      return noContent(res);
    } catch (e) {
      return res.status(500).json({ message: "Error", detail: String(e) });
    }
});

// --- DELETE soft delete ---
router.delete("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query('SELECT "id_usuario" FROM "Personal" WHERE "id_personal"=$1;', [id]);
    await db.query(`UPDATE "Personal" SET "estado"=FALSE WHERE "id_personal"=$1;`, [id]);
    if (rows.length) {
      await db.query(`UPDATE "Usuarios" SET "estado"=FALSE WHERE "id_usuario"=$1;`, [rows[0].id_usuario]);
    }
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// --- PATCH restore ---
router.patch("/:id(\\d+)/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query('SELECT "id_usuario" FROM "Personal" WHERE "id_personal"=$1;', [id]);
    await db.query(`UPDATE "Personal" SET "estado"=TRUE WHERE "id_personal"=$1;`, [id]);
    if (rows.length) {
      await db.query(`UPDATE "Usuarios" SET "estado"=TRUE WHERE "id_usuario"=$1;`, [rows[0].id_usuario]);
    }
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;