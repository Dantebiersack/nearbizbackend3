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

// --- Map DB -> DTO (Incluye datos del Admin) ---
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

// --- GET all ---
router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    
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

    q += ` ORDER BY n."id_negocio", n."estado" DESC`;

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

// --- CREATE (Negocio + Usuario Admin + Personal) ---
router.post("/", async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const dto = req.body;

    const horarioJson = dto.HorarioAtencion || dto.horarioAtencion 
      ? (typeof dto.HorarioAtencion === 'object' ? JSON.stringify(dto.HorarioAtencion) : dto.HorarioAtencion) 
      : JSON.stringify({});

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
        dto.IdMembresia || dto.idMembresia || null,
        dto.Nombre || dto.nombre,
        dto.Direccion || dto.direccion || null,
        dto.CoordenadasLat || dto.coordenadasLat || null,
        dto.CoordenadasLng || dto.coordenadasLng || null,
        dto.Descripcion || dto.descripcion || null,
        dto.TelefonoContacto || dto.telefonoContacto || null,
        dto.CorreoContacto || dto.correoContacto || null,
        horarioJson,
        false,
        dto.LinkUrl || dto.linkUrl || null
      ]
    );

    const negocio = negocioRows[0];

    // 🔥 FIX: crear admin con sus datos reales, no con nombre del negocio
    let passFinal = dto.ContrasenaHash || dto.contrasena;

    const { rows: userRows } = await client.query(
      `INSERT INTO "Usuarios"("nombre","email","contrasena_hash","id_rol","estado")
       VALUES($1,$2,$3,$4,$5)
       RETURNING "id_usuario";`,
      [
        dto.nombreUsuario,   // ✔ CORREGIDO
        dto.email,           // ✔ CORREGIDO
        passFinal,
        2,                   // rol: adminNegocio
        false                // ✔ NO debe iniciar sesión hasta aprobar
      ]
    );

    const usuario = userRows[0];

    await client.query(
      `INSERT INTO "Personal"("id_usuario","id_negocio","rol_en_negocio","estado","fecha_registro")
       VALUES($1,$2,'Administrador',TRUE,CURRENT_TIMESTAMP);`,
      [usuario.id_usuario, negocio.id_negocio]
    );

    await client.query("COMMIT");
    return created(res, `/api/Negocios/${negocio.id_negocio}`, mapToDto(negocio));

  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ ERROR POST /Negocios:", e);
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
    
    let horarioVal = dto.HorarioAtencion || dto.horarioAtencion;
    if (typeof horarioVal === 'object') horarioVal = JSON.stringify(horarioVal);

    await db.query(
      `UPDATE "Negocios" SET 
        "id_categoria"=$1, "id_membresia"=$2, "nombre"=$3, "direccion"=$4, 
        "coordenadas_lat"=$5, "coordenadas_lng"=$6, "descripcion"=$7, 
        "telefono_contacto"=$8, "correo_contacto"=$9, "horario_atencion"=$10, "linkUrl"=$11
      WHERE "id_negocio"=$12;`,
      [
        dto.IdCategoria || dto.idCategoria,
        dto.IdMembresia || dto.idMembresia || null,
        dto.Nombre || dto.nombre,
        dto.Direccion || dto.direccion || null,
        dto.CoordenadasLat || dto.coordenadasLat || null,
        dto.CoordenadasLng || dto.coordenadasLng || null,
        dto.Descripcion || dto.descripcion || null,
        dto.TelefonoContacto || dto.telefonoContacto || null,
        dto.CorreoContacto || dto.correoContacto || null,
        horarioVal || null,
        dto.LinkUrl || dto.linkUrl || null,
        id
      ]
    );
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// --- DELETE negocio ---
router.delete("/:id(\\d+)", async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const id = Number(req.params.id);

    await client.query(`UPDATE "Negocios" SET "estado"=FALSE WHERE "id_negocio"=$1;`, [id]);

    const { rows } = await client.query(`SELECT "id_usuario" FROM "Personal" WHERE "id_negocio"=$1`, [id]);
    
    if (rows.length > 0) {
        const idsUsuarios = rows.map(r => r.id_usuario);
        await client.query(`UPDATE "Personal" SET "estado"=FALSE WHERE "id_negocio"=$1;`, [id]);
        await client.query(`UPDATE "Usuarios" SET "estado"=FALSE WHERE "id_usuario" = ANY($1::int[])`, [idsUsuarios]);
    }

    await client.query("COMMIT");
    return noContent(res);

  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Error", detail: String(e) });
  } finally {
    client.release();
  }
});

// --- RESTORE negocio ---
router.patch("/:id(\\d+)/restore", async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const id = Number(req.params.id);

    await client.query(`UPDATE "Negocios" SET "estado"=TRUE WHERE "id_negocio"=$1;`, [id]);

    const { rows } = await client.query(`SELECT "id_usuario" FROM "Personal" WHERE "id_negocio"=$1`, [id]);

    if (rows.length > 0) {
        const idsUsuarios = rows.map(r => r.id_usuario);
        await client.query(`UPDATE "Personal" SET "estado"=TRUE WHERE "id_negocio"=$1`, [id]);
        await client.query(`UPDATE "Usuarios" SET "estado"=TRUE WHERE "id_usuario" = ANY($1::int[])`, [idsUsuarios]);
    }

    await client.query("COMMIT");
    return noContent(res);

  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Error", detail: String(e) });
  } finally {
    client.release();
  }
});

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
       await db.query(`UPDATE "Personal" SET "estado"=TRUE WHERE "id_negocio"=$1`, [id]);
       await db.query(`UPDATE "Usuarios" SET "estado"=TRUE WHERE "id_usuario" = ANY($1::int[])`, [ids]);
    }

    // Obtener correo real del admin
    const adminRes = await db.query(
      `SELECT u.email 
       FROM "Usuarios" u 
       JOIN "Personal" p ON p.id_usuario = u.id_usuario
       WHERE p.id_negocio=$1
       LIMIT 1`,
      [id]
    );

    const adminMail = adminRes.rows[0]?.email || rows[0].correo_contacto;

    await enviarCorreo(
      adminMail,
      "Tu empresa ha sido aprobada en NearBiz",
      `
        <p>¡Hola!</p>
        <p>Tu solicitud de registro ha sido <strong>aprobada</strong>.</p>
        <p>Ya puedes iniciar sesión en NearBiz.</p>
      `
    );

    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error interno", detail: String(e) });
  }
});

// --- RECHAZAR negocio ---
router.patch("/:id(\\d+)/reject", async (req, res) => {
  const client = await db.pool.connect();
  try {
    const id = Number(req.params.id);
    const { motivo } = req.body;

    await client.query("BEGIN");

    const { rows: negocioRows } = await client.query(
      `SELECT n.nombre, u.email AS admin_email, u.id_usuario
       FROM "Negocios" n
       LEFT JOIN "Personal" p ON p.id_negocio = n.id_negocio
       LEFT JOIN "Usuarios" u ON u.id_usuario = p.id_usuario
       WHERE n.id_negocio = $1 LIMIT 1`,
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

    await client.query(`DELETE FROM "Personal" WHERE id_negocio = $1`, [id]);
    if (idUsuarioAdmin) {
        await client.query(`DELETE FROM "Usuarios" WHERE id_usuario = $1`, [idUsuarioAdmin]);
    }
    await client.query(`DELETE FROM "Negocios" WHERE id_negocio = $1`, [id]);

    await client.query("COMMIT");

    if (adminEmail) {
      await enviarCorreo(
        adminEmail, 
        "Solicitud de registro rechazada",
        `<h2>Tu empresa no fue aprobada ❌</h2>
         <p>Lamentamos informarte que tu solicitud para <strong>${negocio.nombre}</strong> ha sido rechazada.</p>
         <p><strong>Motivo:</strong> ${motivo || "Incumplimiento de requisitos"}</p>`
      );
    }

    client.release();
    return res.json({ ok: true, message: "Negocio rechazado." });

  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    console.error("❌ ERROR REJECT:", err);
    return res.status(500).json({ error: "Error al rechazar el negocio." });
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
      dto.IdCategoria || dto.idCategoria,
      dto.IdMembresia || dto.idMembresia || null,
      dto.Nombre || dto.nombre,
      dto.Direccion || dto.direccion || null,
      dto.CoordenadasLat || dto.coordenadasLat || null,
      dto.CoordenadasLng || dto.coordenadasLng || null,
      dto.Descripcion || dto.descripcion || null,
      dto.TelefonoContacto || dto.telefonoContacto || null,
      dto.CorreoContacto || dto.correoContacto || null,
      dto.HorarioAtencion || dto.horarioAtencion || null,
      dto.LinkUrl || dto.linkUrl || null,
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
