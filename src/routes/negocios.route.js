// Archivo: routes/negocios.js
const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");
const { decodeJwt } = require("../utils/jwt"); // Helper para JWT

const router = Router();

const COLS = `"id_negocio", "id_categoria", "id_membresia", "nombre", "direccion", "coordenadas_lat", "coordenadas_lng", "descripcion", "telefono_contacto", "correo_contacto", "horario_atencion", "estado", "linkUrl"`;

// --- Helper para extraer usuario del token ---
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

// --- Función para mapear DB → DTO ---
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
    return res.json(rows.map(mapToDto));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// GET by id
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(`SELECT ${COLS} FROM "Negocios" WHERE "id_negocio"=$1;`, [id]);
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
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE)
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
    return created(res, `/api/Negocios/${ins.rows[0].id_negocio}`, mapToDto(ins.rows[0]));
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

// PATCH aprobar negocio
router.patch("/:id(\\d+)/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Negocios" SET "estado"=TRUE WHERE "id_negocio"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PATCH rechazar negocio
router.patch("/:id(\\d+)/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Negocios" SET "estado"=FALSE WHERE "id_negocio"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});



// --- GET MiNegocio unificado
router.get("/MiNegocio", async (req, res) => {
  try {
    const auth = getUserFromAuthHeader(req);
    if (!auth) return res.status(401).json({ message: "No autenticado" });

    let idNegocio = null;

    // Dependiendo del rol
    if (auth.rol === "adminNegocio" || auth.rol === "personal") {
      // Buscar id_negocio en Personal
      const { rows: personalRows } = await db.query(
        `SELECT "id_negocio" FROM "Personal" WHERE "id_usuario"=$1 LIMIT 1;`,
        [auth.idUsuario]
      );
      if (!personalRows.length) return res.json(null);
      idNegocio = personalRows[0].id_negocio;

    } else if (auth.rol === "adminNearbiz" && req.query.idNegocio) {
      // Admin de la plataforma puede pasar idNegocio por query
      idNegocio = Number(req.query.idNegocio);
    } else {
      return res.status(403).json({ message: "Rol no autorizado" });
    }

    // Traer negocio
    const { rows: negocioRows } = await db.query(
      `SELECT ${COLS} FROM "Negocios" WHERE "id_negocio"=$1 LIMIT 1;`,
      [idNegocio]
    );
    if (!negocioRows.length) return res.json(null);

    return res.json(mapToDto(negocioRows[0]));

  } catch (e) {
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});

// --- PUT MiNegocio unificado
router.put("/MiNegocio", async (req, res) => {
  try {
    const auth = getUserFromAuthHeader(req);
    if (!auth) return res.status(401).json({ message: "No autenticado" });

    let idNegocio = null;

    if (auth.rol === "adminNegocio" || auth.rol === "personal") {
      const { rows: personalRows } = await db.query(
        `SELECT "id_negocio" FROM "Personal" WHERE "id_usuario"=$1 LIMIT 1;`,
        [auth.idUsuario]
      );
      if (!personalRows.length) return res.status(404).json({ message: "No tienes un negocio vinculado" });
      idNegocio = personalRows[0].id_negocio;

    } else if (auth.rol === "adminNearbiz" && req.body.IdNegocio) {
      idNegocio = Number(req.body.IdNegocio);
    } else {
      return res.status(403).json({ message: "Rol no autorizado" });
    }

    const dto = req.body;

    const q = `
      UPDATE "Negocios" SET
        "id_categoria"=$1, "id_membresia"=$2, "nombre"=$3, "direccion"=$4,
        "coordenadas_lat"=$5, "coordenadas_lng"=$6, "descripcion"=$7,
        "telefono_contacto"=$8, "correo_contacto"=$9, "horario_atencion"=$10, "linkUrl"=$11
      WHERE "id_negocio"=$12
      RETURNING *;
    `;

    const values = [
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
      idNegocio
    ];

    const { rows: updatedRows } = await db.query(q, values);
    if (!updatedRows.length) return res.status(404).json({ message: "Negocio no encontrado" });

    return res.json({ message: "Actualizado correctamente", negocio: mapToDto(updatedRows[0]) });

  } catch (e) {
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});




module.exports = router;
