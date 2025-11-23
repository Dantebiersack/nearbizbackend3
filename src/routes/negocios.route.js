//ARCHIVO DE NEGOCIO DE PARTE DE BACK PARA CORROBORAR ACAPTACION O RECHAZO DE LAS SOLICITUDES DE EMPRESAS 
const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");

const router = Router();

const COLS = `"id_negocio", "id_categoria", "id_membresia", "nombre", "direccion", "coordenadas_lat", "coordenadas_lng", "descripcion", "telefono_contacto", "correo_contacto", "horario_atencion", "estado", "linkUrl"`;


function mapToDto(r) {
  return {
    IdNegocio: r.id_negocio,
    IdCategoria: r.id_categoria,
    IdMembresia: r.id_membresia,
    Nombre: r.nombre,
    Direccion: r.direccion,
    CoordenadasLat: r.coordenadas_lat,
    CoordenadasLng: r.coordenadas_lng,
    Descripcion: r.descripcion,
    TelefonoContacto: r.telefono_contacto,
    CorreoContacto: r.correo_contacto,
    HorarioAtencion: r.horario_atencion,
    Estado: r.estado,
    LinkUrl: r.linkUrl 
  };
}
// -------------------------

// GET all
router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    const q = includeInactive
      ? `SELECT ${COLS} FROM "Negocios" ORDER BY "id_negocio";`
      : `SELECT ${COLS} FROM "Negocios" WHERE "estado"=TRUE ORDER BY "id_negocio";`;

    const { rows } = await db.query(q);
    const data = rows.map(mapToDto);
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// GET by id
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `SELECT ${COLS} FROM "Negocios" WHERE "id_negocio"=$1;`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    return res.json(mapToDto(rows[0]));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// POST create
router.post("/", async (req, res) => {
  try {
    const dto = req.body; 
    const ins = await db.query(
      `INSERT INTO "Negocios"(
         "id_categoria", "id_membresia", "nombre", "direccion", "coordenadas_lat", 
         "coordenadas_lng", "descripcion", "telefono_contacto", "correo_contacto", 
         "horario_atencion", "linkUrl", "estado"
       )
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
       RETURNING ${COLS};`,
      [
        dto.IdCategoria,
        dto.IdMembresia || null,
        dto.Nombre,
        dto.Direccion || null,
        dto.CoordenadasLat || null,
        dto.CoordenadasLng || null,
        dto.Descripcion || null,
        dto.TelefonoContacto || null,
        dto.CorreoContacto || null,
        dto.HorarioAtencion || null,
        dto.LinkUrl || null
      ]
    );
    const body = mapToDto(ins.rows[0]);
    return created(res, `/api/Negocios/${body.IdNegocio}`, body);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PUT update
router.put("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dto = req.body;
    await db.query(
      `UPDATE "Negocios" SET 
         "id_categoria"=$1, "id_membresia"=$2, "nombre"=$3, "direccion"=$4, 
         "coordenadas_lat"=$5, "coordenadas_lng"=$6, "descripcion"=$7, 
         "telefono_contacto"=$8, "correo_contacto"=$9, "horario_atencion"=$10, "linkUrl"=$11
       WHERE "id_negocio"=$12;`,
      [
        dto.IdCategoria,
        dto.IdMembresia || null,
        dto.Nombre,
        dto.Direccion || null,
        dto.CoordenadasLat || null,
        dto.CoordenadasLng || null,
        dto.Descripcion || null,
        dto.TelefonoContacto || null,
        dto.CorreoContacto || null,
        dto.HorarioAtencion || null,
        dto.LinkUrl || null,
        id 
      ]
    );
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// DELETE soft delete
router.delete("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Negocios" SET "estado"=FALSE WHERE "id_negocio"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PATCH restore
router.patch("/:id(\\d+)/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Negocios" SET "estado"=TRUE WHERE "id_negocio"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// -----------------------------------------------------
//  NUEVOS ENDPOINTS PARA APROBAR O RECHAZAR SOLICITUDES
//  editado Alondra Martínez para manejo de solicitudes
// -----------------------------------------------------

// PATCH aprobar negocio
router.patch("/:id(\\d+)/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(
      `UPDATE "Negocios" SET "estado"=TRUE WHERE "id_negocio"=$1;`,
      [id]
    );
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PATCH rechazar negocio
router.patch("/:id(\\d+)/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(
      `UPDATE "Negocios" SET "estado"=FALSE WHERE "id_negocio"=$1;`,
      [id]
    );
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// OBTENER EL NEGOCIO DEL USUARIO LOGUEADO
router.get("/MiNegocio", async (req, res) => {
  try {
    console.log("req.user:", req.user); // 🔹 depuración
    const auth = req.user;
    if (!auth) return res.status(401).json({ message: "No autenticado" });

    if (auth.rol !== "adminNegocio") {
      return res.status(403).json({ message: "Acceso denegado" });
    }

    const q = `
      SELECT ${COLS}
      FROM "Negocios"
      WHERE "id_usuario" = $1
      LIMIT 1;
    `;

    const { rows } = await db.query(q, [auth.idUsuario]);

    if (!rows.length) return res.json(null);
    return res.json(mapToDto(rows[0]));

  } catch (e) {
    console.error("Error en GET /MiNegocio:", e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

router.put("/MiNegocio", async (req, res) => {
  try {
    const auth = req.user;
    if (!auth) return res.status(401).json({ message: "No autenticado" });

    if (auth.rol !== "adminNegocio") {
      return res.status(403).json({ message: "Acceso denegado" });
    }

    const dto = req.body;

    const q = `
      UPDATE "Negocios" SET 
        "id_categoria"=$1, "id_membresia"=$2, "nombre"=$3, "direccion"=$4,
        "coordenadas_lat"=$5, "coordenadas_lng"=$6, "descripcion"=$7,
        "telefono_contacto"=$8, "correo_contacto"=$9, "horario_atencion"=$10,
        "linkUrl"=$11
      WHERE "id_usuario"=$12;
    `;

    await db.query(q, [
      dto.IdCategoria,
      dto.IdMembresia || null,
      dto.Nombre,
      dto.Direccion || null,
      dto.CoordenadasLat || null,
      dto.CoordenadasLng || null,
      dto.Descripcion || null,
      dto.TelefonoContacto || null,
      dto.CorreoContacto || null,
      dto.HorarioAtencion || null,
      dto.LinkUrl || null,
      auth.idUsuario
    ]);

    return res.json({ message: "Actualizado correctamente" });

  } catch (e) {
    console.error("Error en PUT /MiNegocio:", e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;
