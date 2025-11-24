// src/routes/servicios.route.js
const { Router } = require("express");
const db = require("../db");
const { decodeJwt } = require("../utils/jwt");
const router = Router();


const mapServicio = (s) => ({
  IdServicio: s.id_servicio,
  IdNegocio: s.id_negocio,
  NombreServicio: s.nombre_servicio,
  Descripcion: s.descripcion,
  Precio: Number(s.precio),
  DuracionMinutos: s.duracion_minutos,
  Estado: s.estado,
});

function getUserFromAuthHeader(req) {
  const auth = req.headers.authorization || "";

  const parts = auth.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    console.warn("Authorization mal formado o vacío");
    return null;
  }

  const token = parts[1];

  // decodeJwt({ complete:true }) => { header, payload, signature }
  const decoded = decodeJwt(token);
  if (!decoded || !decoded.payload) {
    console.error("decodeJwt no devolvió payload");
    return null;
  }

  const payload = decoded.payload; // 👈 aquí viene { sub, rol, iat, exp, ... }

  console.log("JWT payload (decode) >>>", payload);

  // en el login hiciste: signJwt({ sub: userId, rol: u.rol })
  const idUsuario = Number(payload.sub);
  const rol = payload.rol;

  if (!idUsuario || !rol) {
    console.error("Payload sin sub/rol válidos");
    return null;
  }

  return { idUsuario, rol };
}

function requireUser(req, res) {
  const user = getUserFromAuthHeader(req);
  if (!user) {
    res.status(401).json({ message: "Token inválido o ausente" });
    return null;
  }
  return user;
}

function isSuperAdmin(rol) {
  return rol === "adminNearbiz" || rol === "superadmin";
}

function isAdminNegocio(rol) {
  return rol === "adminNegocio" || isSuperAdmin(rol);
}

/**
 * Devuelve los id_negocio a los que pertenece un usuario (tabla Personal)
 * Solo negocios activos y personal activo.
 */
async function getNegociosIdsByUser(idUsuario) {
  const { rows } = await db.query(
    `
    SELECT DISTINCT p."id_negocio"
    FROM "Personal" p
    JOIN "Negocios" n ON n."id_negocio" = p."id_negocio"
    WHERE p."id_usuario" = $1
  `,
    [idUsuario]
  );
  return rows.map((r) => r.id_negocio);
}

/**
 * Verifica si el usuario puede operar sobre un negocio concreto.
 */
async function assertUserCanAccessNegocio(idUsuario, rol, idNegocio) {
  if (isSuperAdmin(rol)) return true;
  const negocios = await getNegociosIdsByUser(idUsuario);
  return negocios.includes(Number(idNegocio));
}

// ---------- GET /servicios ----------
// Lista servicios:
// - SuperAdmin: puede ver todos o filtrar por ?idNegocio
// - AdminNegocio/Personal: se filtra automáticamente por los negocios de la tabla Personal
router.get("/", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { idUsuario, rol } = user;

    const includeInactive =
      String(req.query.includeInactive || "false") === "true";

    const cond = [];
    const params = [];

    if (!includeInactive) {
      params.push(true);
      cond.push(`s."estado" = $${params.length}`);
    }

    if (isSuperAdmin(rol)) {
      // puede opcionalmente filtrar por negocio
      const idNegocio = req.query.idNegocio
        ? Number(req.query.idNegocio)
        : null;
      if (idNegocio) {
        params.push(idNegocio);
        cond.push(`s."id_negocio" = $${params.length}`);
      }
      // sin idNegocio → ve todos
    } else {
      // usuario normal / admin de negocio: solo sus negocios
      const negocios = await getNegociosIdsByUser(idUsuario);
      if (!negocios.length) {
        return res.status(403).json({
          message:
            "No tienes negocios asociados para listar servicios",
        });
      }
      params.push(negocios);
      cond.push(`s."id_negocio" = ANY($${params.length})`);
    }

    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const sql = `
      SELECT s.*
      FROM "Servicios" s
      ${where}
      ORDER BY s."id_servicio"
    `;

    const { rows } = await db.query(sql, params);
    res.json(rows.map(mapServicio));
  } catch (e) {
    console.error("Error GET /servicios:", e);
    res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ---------- GET /servicios/:id ----------
router.get("/:id", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { idUsuario, rol } = user;

    const { rows } = await db.query(
      `SELECT * FROM "Servicios" WHERE "id_servicio" = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();

    const srv = rows[0];

    // Solo puedes ver el servicio si pertenece a uno de tus negocios (o eres superadmin)
    const canAccess = await assertUserCanAccessNegocio(
      idUsuario,
      rol,
      srv.id_negocio
    );
    if (!canAccess) {
      return res
        .status(403)
        .json({ message: "No tienes acceso a este servicio" });
    }

    res.json(mapServicio(srv));
  } catch (e) {
    console.error("Error GET /servicios/:id:", e);
    res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ---------- POST /servicios ----------
// ---------- POST /servicios ----------
router.post("/", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { idUsuario, rol } = user;

    if (!isAdminNegocio(rol)) {
      return res
        .status(403)
        .json({ message: "No tienes permisos para crear servicios" });
    }

    let { idNegocio, nombreServicio, descripcion, precio, duracionMinutos } =
      req.body;

    // 🔹 Normalizamos/convertimos números
    if (idNegocio != null) {
      idNegocio = Number(idNegocio);
      if (!idNegocio || Number.isNaN(idNegocio)) idNegocio = null;
    }
    precio = Number(precio);
    duracionMinutos = Number(duracionMinutos);

    // 🔹 Resolver idNegocio según el rol
    let idNegocioFinal = null;

    if (isSuperAdmin(rol)) {
      // Superadmin DEBE indicar el negocio
      if (!idNegocio) {
        return res.status(400).json({
          message: "idNegocio es obligatorio para crear servicios (superadmin)",
        });
      }
      idNegocioFinal = idNegocio;
    } else {
      // Admin de negocio: lo sacamos de la tabla Personal
      const negocios = await getNegociosIdsByUser(idUsuario); // [1,2,...]
      if (!negocios.length) {
        return res.status(403).json({
          message:
            "No tienes negocios asociados; no puedes crear servicios",
        });
      }

      if (negocios.length === 1 && !idNegocio) {
        // Caso típico: solo pertenece a un negocio
        idNegocioFinal = negocios[0];
      } else if (idNegocio && negocios.includes(idNegocio)) {
        // Si por alguna razón mandan idNegocio, lo validamos contra sus negocios
        idNegocioFinal = idNegocio;
      } else if (negocios.length > 1 && !idNegocio) {
        // Tiene varios negocios y no especificó
        return res.status(400).json({
          message:
            "Tienes más de un negocio asociado, especifica idNegocio en el body",
          negociosDisponibles: negocios,
        });
      } else {
        return res.status(403).json({
          message: "No puedes crear servicios para este negocio",
        });
      }
    }

    if (!nombreServicio || !precio || !duracionMinutos) {
      return res.status(400).json({
        message:
          "Faltan datos obligatorios: nombreServicio, precio, duracionMinutos",
      });
    }

    const { rows } = await db.query(
      `INSERT INTO "Servicios"
       ("id_negocio","nombre_servicio","descripcion","precio","duracion_minutos","estado")
       VALUES ($1,$2,$3,$4,$5,TRUE)
       RETURNING *`,
      [idNegocioFinal, nombreServicio, descripcion || null, precio, duracionMinutos]
    );

    res.status(201).json(mapServicio(rows[0]));
  } catch (e) {
    console.error("Error POST /servicios:", e);
    res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ---------- PUT /servicios/:id ----------
router.put("/:id", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { idUsuario, rol } = user;

    if (!isAdminNegocio(rol)) {
      return res
        .status(403)
        .json({ message: "No tienes permisos para actualizar servicios" });
    }

    // primero obtengo el servicio para ver a qué negocio pertenece
    const { rows } = await db.query(
      `SELECT * FROM "Servicios" WHERE "id_servicio" = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    const srv = rows[0];

    const canAccess = await assertUserCanAccessNegocio(
      idUsuario,
      rol,
      srv.id_negocio
    );
    if (!canAccess) {
      return res
        .status(403)
        .json({ message: "No puedes editar servicios de este negocio" });
    }

    const { nombreServicio, descripcion, precio, duracionMinutos } = req.body;

    const { rowCount } = await db.query(
      `UPDATE "Servicios"
       SET "nombre_servicio"  = $1,
           "descripcion"      = $2,
           "precio"           = $3,
           "duracion_minutos" = $4
       WHERE "id_servicio" = $5`,
      [
        nombreServicio,
        descripcion || null,
        precio,
        duracionMinutos,
        req.params.id,
      ]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) {
    console.error("Error PUT /servicios/:id:", e);
    res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ---------- DELETE /servicios/:id ----------
// Baja lógica
router.delete("/:id", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { idUsuario, rol } = user;

    if (!isAdminNegocio(rol)) {
      return res
        .status(403)
        .json({ message: "No tienes permisos para eliminar servicios" });
    }

    const { rows } = await db.query(
      `SELECT * FROM "Servicios" WHERE "id_servicio" = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    const srv = rows[0];

    const canAccess = await assertUserCanAccessNegocio(
      idUsuario,
      rol,
      srv.id_negocio
    );
    if (!canAccess) {
      return res
        .status(403)
        .json({ message: "No puedes eliminar servicios de este negocio" });
    }

    const { rowCount } = await db.query(
      `UPDATE "Servicios"
       SET "estado" = FALSE
       WHERE "id_servicio" = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) {
    console.error("Error DELETE /servicios/:id:", e);
    res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// ---------- PATCH /servicios/:id/restore ----------
// Reactiva un servicio
router.patch("/:id/restore", async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;
    const { idUsuario, rol } = user;

    if (!isAdminNegocio(rol)) {
      return res
        .status(403)
        .json({ message: "No tienes permisos para restaurar servicios" });
    }

    const { rows } = await db.query(
      `SELECT * FROM "Servicios" WHERE "id_servicio" = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    const srv = rows[0];

    const canAccess = await assertUserCanAccessNegocio(
      idUsuario,
      rol,
      srv.id_negocio
    );
    if (!canAccess) {
      return res
        .status(403)
        .json({ message: "No puedes restaurar servicios de este negocio" });
    }

    const { rowCount } = await db.query(
      `UPDATE "Servicios"
       SET "estado" = TRUE
       WHERE "id_servicio" = $1`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) {
    console.error("Error PATCH /servicios/:id/restore:", e);
    res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;
