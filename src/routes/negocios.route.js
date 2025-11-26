const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");
const { decodeJwt } = require("../utils/jwt");
const { enviarCorreo } = require("../utils/mailer");
const bcrypt = require("bcryptjs");

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

// --- Map DB -> DTO (MODIFICADO: Incluye Admin) ---
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
    LinkUrl: r.linkUrl,
    // 👇 Campos Nuevos para la tabla
    AdminNombre: r.admin_nombre || "Sin Asignar",
    AdminEmail: r.admin_email || ""
  };
}

// --- GET solicitudes ---
router.get("/solicitudes", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${COLS} FROM "Negocios" WHERE "estado" = FALSE ORDER BY "id_negocio";`
    );
    return res.json(rows.map(mapToDto));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// --- GET all (MODIFICADO con JOIN) ---
router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    
    // 👇 CAMBIO AQUÍ: Agregamos 'DISTINCT ON (n."id_negocio")'
    // Esto le dice a la BD: "Si hay duplicados del mismo negocio, dame solo el primero".
    let q = `
      SELECT DISTINCT ON (n."id_negocio")
        n.*,
        u."nombre" as admin_nombre,
        u."email" as admin_email
      FROM "Negocios" n
      LEFT JOIN "Personal" p ON n."id_negocio" = p."id_negocio" AND (p."rol_en_negocio" = 'Administrador' OR p."rol_en_negocio" = 'Dueño')
      LEFT JOIN "Usuarios" u ON p."id_usuario" = u."id_usuario"
    `;

    if (!includeInactive) {
      q += ` WHERE n."estado" = TRUE`;
    }

    // DISTINCT ON requiere que el ORDER BY empiece con la misma columna
    q += ` ORDER BY n."id_negocio"`;

    const { rows } = await db.query(q);
    return res.json(rows.map(mapToDto));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// --- GET by id ---
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

// --- CREATE negocio + usuario adminNegocio ---
router.post("/", async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const dto = req.body;
    const horarioJson = dto.horarioAtencion ? JSON.stringify(dto.horarioAtencion) : JSON.stringify({});

    // --- Insertar negocio ---
    const { rows: negocioRows } = await client.query(
      `INSERT INTO "Negocios"(
        "id_categoria","id_membresia","nombre","direccion",
        "coordenadas_lat","coordenadas_lng","descripcion",
        "telefono_contacto","correo_contacto","horario_atencion",
        "estado","linkUrl"
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING ${COLS};`,
      [
  dto.IdCategoria || dto.idCategoria,  // ← AQUI QUEDA EL FIX
  dto.IdMembresia || dto.idMembresia,
  dto.Nombre,
  dto.Direccion,
  dto.CoordenadasLat,
  dto.CoordenadasLng,
  dto.Descripcion,
  dto.TelefonoContacto,
  dto.CorreoContacto,
  horarioJson,
  false,
  dto.LinkUrl
]

    );

    const negocio = negocioRows[0];

    // --- Crear usuario adminNegocio ---
    const passLimpia = dto.ContrasenaHash || dto.contrasena; // Soporte para ambos nombres

    const { rows: userRows } = await client.query(
      `INSERT INTO "Usuarios"("nombre", "email", "contrasena_hash", "id_rol", "estado")
       VALUES($1, $2, $3, $4, TRUE)
       RETURNING "id_usuario";`,
      [
        dto.Nombre || dto.nombreUsuario,
        dto.Email || dto.email,
        passLimpia,
        2
      ]
    );

    const usuario = userRows[0];

    // --- Vincular usuario con negocio ---
    await client.query(
      `INSERT INTO "Personal"("id_usuario","id_negocio", "rol_en_negocio", "estado", "fecha_registro")
       VALUES($1,$2, 'Administrador', TRUE, CURRENT_TIMESTAMP);`,
      [usuario.id_usuario, negocio.id_negocio]
    );

    await client.query("COMMIT");

    return created(res, `/api/Negocios/${negocio.id_negocio}`, mapToDto(negocio));
  } catch (e) {
    await client.query("ROLLBACK");
    console.log("❌ ERROR POST /Negocios:", e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  } finally {
    client.release();
  }
});

// --- UPDATE negocio ---
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

// --- DELETE negocio (Desactiva Admin también) ---
router.delete("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    
    await db.query(`UPDATE "Negocios" SET "estado"=FALSE WHERE "id_negocio"=$1;`, [id]);

    const { rows } = await db.query(`SELECT "id_usuario" FROM "Personal" WHERE "id_negocio"=$1`, [id]);
    
    if (rows.length > 0) {
        const idsUsuarios = rows.map(r => r.id_usuario);
        await db.query(`UPDATE "Usuarios" SET "estado"=FALSE WHERE "id_usuario" = ANY($1::int[])`, [idsUsuarios]);
    }

    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

router.patch("/:id(\\d+)/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);

    // 1. Activar negocio
    await db.query(
      `UPDATE "Negocios" SET "estado"=TRUE WHERE "id_negocio"=$1;`,
      [id]
    );

    // 2. Obtener admin del negocio con JOIN
    const { rows } = await db.query(`
      SELECT 
        n.*,
        u."email" AS admin_email,
        u."nombre" AS admin_nombre
      FROM "Negocios" n
      LEFT JOIN "Personal" p ON n."id_negocio" = p."id_negocio"
      LEFT JOIN "Usuarios" u ON p."id_usuario" = u."id_usuario"
      WHERE n."id_negocio" = $1
      LIMIT 1;
    `, [id]);

    if (!rows.length) return res.status(404).json({ message: "Negocio no encontrado" });

    // 3. Activar usuario admin
    await db.query(`
      UPDATE "Usuarios" 
      SET "estado"=TRUE 
      WHERE "id_usuario" IN (
        SELECT "id_usuario" FROM "Personal" WHERE "id_negocio"=$1
      );
    `, [id]);

    const negocio = rows[0];

    // 4. Notificar por correo
    const asunto = "Tu empresa ha sido aprobada en NearBiz";
    const mensaje = `
      <p>¡Hola ${negocio.admin_nombre}!</p>
      <p>Tu negocio <strong>${negocio.nombre}</strong> ha sido aprobado.</p>
      <p>Usuario: ${negocio.admin_email}</p>
      <p>Contraseña: (la que configuraste al registrarte)</p>
      <p>Ya puedes iniciar sesión en NearBiz.</p>
    `;

    await enviarCorreo(negocio.admin_email, asunto, mensaje);

    return noContent(res);
  } catch (e) {
    console.log("❌ ERROR APPROVE:", e);
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});

/*
// --- APROBAR negocio ---
router.patch("/:id(\\d+)/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `UPDATE "Negocios" SET "estado"=TRUE WHERE "id_negocio"=$1 RETURNING *;`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "No encontrado" });

    const personalRes = await db.query(`SELECT "id_usuario" FROM "Personal" WHERE "id_negocio"=$1`, [id]);
    if (personalRes.rows.length > 0) {
       const ids = personalRes.rows.map(r => r.id_usuario);
       await db.query(`UPDATE "Usuarios" SET "estado"=TRUE WHERE "id_usuario" = ANY($1::int[])`, [ids]);
    }

    const negocio = rows[0];
    const asunto = "Tu empresa ha sido aprobada en NearBiz";
    const mensaje = `
      <p>¡Hola ${negocio.nombre}!</p>
      <p>Tu solicitud de registro ha sido <strong>aprobada</strong>.</p>
      <p>Usuario: ${negocio.correo_contacto}</p>
      <p>Contraseña: (la que configuraste al registrarte)</p>
      <p>Ahora puedes iniciar sesión en NearBiz.</p>
    `;
    await enviarCorreo(negocio.correo_contacto, asunto, mensaje);

    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});
*/
// --- RECHAZAR negocio ---
router.patch("/:id(\\d+)/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `UPDATE "Negocios" SET "estado"=FALSE WHERE "id_negocio"=$1 RETURNING *;`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "No encontrado" });

    const personalRes = await db.query(`SELECT "id_usuario" FROM "Personal" WHERE "id_negocio"=$1`, [id]);
    if (personalRes.rows.length > 0) {
       const ids = personalRes.rows.map(r => r.id_usuario);
       await db.query(`UPDATE "Usuarios" SET "estado"=FALSE WHERE "id_usuario" = ANY($1::int[])`, [ids]);
    }

    const negocio = rows[0];
    const motivo = req.body.motivoRechazo || "No se especificó un motivo";
    const asunto = "Tu empresa ha sido rechazada en NearBiz";
    const mensaje = `
      <p>¡Hola ${negocio.nombre}!</p>
      <p>Tu solicitud de registro ha sido <strong>rechazada</strong>.</p>
      <p>Motivo: ${motivo}</p>
      <p>Si tienes dudas, contacta con NearBiz.</p>
    `;
    await enviarCorreo(negocio.correo_contacto, asunto, mensaje);

    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});

// --- MiNegocio GET ---
router.get("/MiNegocio", async (req, res) => {
  try {
    const auth = getUserFromAuthHeader(req);
    if (!auth) return res.status(401).json({ message: "No autenticado" });

    let idNegocio = null;

    if (auth.rol === "adminNegocio" || auth.rol === "personal") {
      const { rows: personalRows } = await db.query(
        `SELECT "id_negocio" FROM "Personal" WHERE "id_usuario"=$1 LIMIT 1;`,
        [auth.idUsuario]
      );
      if (!personalRows.length) return res.json(null);
      idNegocio = personalRows[0].id_negocio;
    } else if (auth.rol === "adminNearbiz" && req.query.idNegocio) {
      idNegocio = Number(req.query.idNegocio);
    } else {
      return res.status(403).json({ message: "Rol no autorizado" });
    }

    const { rows: negocioRows } = await db.query(
      `SELECT ${COLS} FROM "Negocios" WHERE "id_negocio"=$1 LIMIT 1;`,
      [idNegocio]
    );
    if (!negocioRows.length) return res.json(null);

    // En este endpoint específico, quizás quieras agregar el admin también, o dejarlo simple.
    // Por ahora lo dejamos simple según lo tenías.
    return res.json(mapToDto(negocioRows[0]));
  } catch (e) {
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});

// --- MiNegocio PUT ---
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