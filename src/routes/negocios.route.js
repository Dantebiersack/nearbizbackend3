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
  dto.IdCategoria || dto.idCategoria,
  dto.IdMembresia || dto.idMembresia,
  dto.Nombre || dto.nombre || dto.nombreNegocio,
  dto.Direccion || dto.direccion,
  dto.CoordenadasLat || dto.coordenadasLat,
  dto.CoordenadasLng || dto.coordenadasLng,
  dto.Descripcion || dto.descripcion,
  dto.TelefonoContacto || dto.telefonoContacto,
  dto.CorreoContacto || dto.correoContacto,
  horarioJson,
  false,
  dto.LinkUrl || dto.linkUrl
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
  dto.Nombre || dto.nombreUsuario || dto.nombreNegocio,
  dto.Email || dto.email || dto.correoContacto,
  dto.ContrasenaHash || dto.contrasena,
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

/* router.patch("/:id(\\d+)/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);

    // 1. Activar negocio
    await db.query(
      `UPDATE "Negocios" SET "estado"=TRUE WHERE "id_negocio"=$1;`,
      [id]
    );

    // 2. Obtener ÚNICAMENTE al administrador
    const { rows } = await db.query(`
      SELECT DISTINCT ON (n."id_negocio")
        n."nombre",
        u."email" AS admin_email,
        u."nombre" AS admin_nombre
      FROM "Negocios" n
      LEFT JOIN "Personal" p 
        ON n."id_negocio" = p."id_negocio"
        AND (p."rol_en_negocio" = 'Administrador' OR p."rol_en_negocio" = 'Dueño')
      LEFT JOIN "Usuarios" u 
        ON p."id_usuario" = u."id_usuario"
      WHERE n."id_negocio" = $1
      ORDER BY n."id_negocio";
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ message: "No existe negocio o no tiene admin asignado" });
    }

    const negocio = rows[0];

    if (!negocio.admin_email) {
      return res.status(400).json({ message: "No se encontró el correo del administrador" });
    }

    // 3. Activar usuario administrador
    await db.query(`
      UPDATE "Usuarios" 
      SET "estado"=TRUE 
      WHERE "id_usuario" IN (
        SELECT "id_usuario" FROM "Personal" WHERE "id_negocio"=$1
      );
    `, [id]);


    // 4. Enviar correo
    const asunto = "Tu empresa ha sido aprobada en NearBiz";
    const mensaje = `
      <p>¡Hola ${negocio.admin_nombre || 'Usuario'}!</p>
      <p>Tu negocio <strong>${negocio.nombre}</strong> ha sido aprobado.</p>
      <p>Usuario: ${negocio.admin_email}</p>
      <p>Ya puedes iniciar sesión.</p>
    `;

    await enviarCorreo(negocio.admin_email, asunto, mensaje);

    return noContent(res);

  } catch (e) {
    console.log("❌ ERROR APPROVE:", e);
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});
*/

// --- RECHAZAR SOLICITUD DE NEGOCIO (ELIMINA TODO) ---
router.patch("/:id(\\d+)/reject", async (req, res) => {
  const client = await db.pool.connect(); // ✔ correcto

  try {
    const id = Number(req.params.id);
    const { motivo } = req.body;

    await client.query("BEGIN");

    // 1. Obtener info del negocio + admin
    const { rows: negocioRows } = await client.query(
      `SELECT n.nombre, u.email AS admin_email, u.id_usuario
       FROM "Negocios" n
       LEFT JOIN "Personal" p ON p.id_negocio = n.id_negocio
       LEFT JOIN "Usuarios" u ON u.id_usuario = p.id_usuario
       WHERE n.id_negocio = $1
       LIMIT 1`,
      [id]
    );

    if (!negocioRows.length) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(404).json({ error: "Negocio no encontrado" });
    }

    const negocio = negocioRows[0];
    const adminEmail = negocio.admin_email;
    const idUsuarioAdmin = negocio.id_usuario;

    // 2. BORRAR Personal
    await client.query(
      `DELETE FROM "Personal" WHERE id_negocio = $1`,
      [id]
    );

    // 3. BORRAR Usuario Admin
    if (idUsuarioAdmin) {
      await client.query(
        `DELETE FROM "Usuarios" WHERE id_usuario = $1`,
        [idUsuarioAdmin]
      );
    }

    // 4. BORRAR negocio
    await client.query(
      `DELETE FROM "Negocios" WHERE id_negocio = $1`,
      [id]
    );

    await client.query("COMMIT");

    // 5. Enviar correo al dueño
    // 5. Enviar correo al dueño
if (adminEmail) {
  await enviarCorreo(
    adminEmail, 
    "Solicitud de registro rechazada",
    `
      <h2>Tu empresa no fue aprobada ❌</h2>
      <p>Lamentamos informarte que tu solicitud de registro para <strong>${negocio.nombre}</strong> ha sido rechazada.</p>
      <p><strong>Motivo:</strong> ${motivo}</p>
    `
  );
}


    client.release();

    return res.json({
      ok: true,
      message: "Negocio rechazado, eliminado completamente y correo enviado."
    });

  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    console.error("❌ ERROR REJECT:", err);
    return res.status(500).json({ error: "Error al rechazar el negocio." });
  }
});



// APROBAR SOLICITUD DE NEGOCIO
router.patch("/:id(\\d+)/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const client = await db.pool.connect();

    // 1️⃣ Obtener negocio + correo del admin (CORREGIDO)
    const { rows: negocioRows } = await client.query(
      `SELECT n.nombre, u.email AS admin_email
       FROM "Negocios" n
       LEFT JOIN "Personal" p ON p.id_negocio = n.id_negocio
       LEFT JOIN "Usuarios" u ON u.id_usuario = p.id_usuario
       WHERE n.id_negocio = $1
       LIMIT 1`,
      [id]
    );

    if (!negocioRows.length) {
      client.release();
      return res.status(404).json({ error: "Negocio no encontrado." });
    }

    const negocio = negocioRows[0];
    const adminEmail = negocio.admin_email;

    if (!adminEmail) {
      client.release();
      return res.status(400).json({ error: "El administrador no tiene correo registrado." });
    }

    // 2️⃣ Actualizar estado del negocio
    await client.query(
      `UPDATE "Negocios"
       SET estado = TRUE
       WHERE id_negocio = $1`,
      [id]
    );

    // 3️⃣ Enviar correo al administrador
    await enviarCorreo({
      to: adminEmail,
      subject: "Solicitud de registro aprobada",
      html: `
        <h2>🎉 Tu negocio ha sido aprobado</h2>
        <p>¡Felicidades! Tu empresa <strong>${negocio.nombre}</strong> ya está activa dentro de NearBiz.</p>
        <p>Ahora puedes iniciar sesión y administrar toda la información de tu negocio.</p>
      `,
    });

    client.release();

    return res.json({
      ok: true,
      message: "Negocio aprobado y correo enviado.",
    });

  } catch (e) {
    console.error("❌ ERROR APPROVE:", e);
    return res.status(500).json({ error: "Error al aprobar el negocio." });
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