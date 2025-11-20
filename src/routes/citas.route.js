// src/routes/citas.route.js
const { Router } = require("express");
const db = require("../db");
const router = Router();
const { decodeJwt } = require("../utils/jwt");

const mapCita = (c) => ({
  IdCita: c.id_cita,
  IdCliente: c.id_cliente,
  IdTecnico: c.id_tecnico,
  IdServicio: c.id_servicio,
  FechaCita: c.fecha_cita,     // DATE
  HoraInicio: c.hora_inicio,   // TIME
  HoraFin: c.hora_fin,         // TIME
  Estado: c.estado,            // 'pendiente' | 'confirmada' | 'cancelada' ...
  MotivoCancelacion: c.motivo_cancelacion,
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

function mapCitaRow(row) {
  return {
    idCita: row.id_cita,
    idCliente: row.id_cliente,
    idTecnico: row.id_tecnico,
    idServicio: row.id_servicio,
    fechaCita: row.fecha_cita,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    estado: row.estado,
    motivoCancelacion: row.motivo_cancelacion,
    negocioId: row.id_negocio,
    negocioNombre: row.negocio_nombre,
    clienteNombre: row.cliente_nombre,
    tecnicoNombre: row.tecnico_nombre,
    servicioNombre: row.servicio_nombre,
  };
}

router.get("/by-role", async function (req, res) {
  try {
    const auth = getUserFromAuthHeader(req);

    if (!auth) {
      return res.status(401).json({
        message: "Token ausente o inválido en Authorization",
      });
    }

    const rol = auth.rol;         // "adminNearbiz" | "adminNegocio" | "personal"
    const idUsuario = auth.idUsuario;

    console.log("Usuario desde JWT >>>", { idUsuario, rol });

    var where = "";
    var params = [];

    if (rol === "adminNearbiz") {
      where = "";
      params = [];
    } else if (rol === "adminNegocio") {
      // Ajusta esta parte a tu modelo real.
      where = 'WHERE neg."id_usuario_admin" = $1';
      params = [idUsuario];
    } else if (rol === "personal") {
      where = 'WHERE tec."id_usuario" = $1';
      params = [idUsuario];
    } else {
      return res
        .status(403)
        .json({ message: "Rol sin permiso para consultar citas" });
    }

    const sql =
      'SELECT ' +
      '  ci."id_cita",' +
      '  ci."id_cliente",' +
      '  ci."id_tecnico",' +
      '  ci."id_servicio",' +
      '  ci."fecha_cita",' +
      '  ci."hora_inicio",' +
      '  ci."hora_fin",' +
      '  ci."estado",' +
      '  ci."motivo_cancelacion",' +
      '  neg."id_negocio",' +
      '  neg."nombre"            AS negocio_nombre,' +
      '  u_cli."nombre"          AS cliente_nombre,' +
      '  u_tec."nombre"          AS tecnico_nombre,' +
      '  s."nombre_servicio"     AS servicio_nombre ' +
      'FROM "Citas" ci ' +
      'JOIN "Servicios" s   ON s."id_servicio"   = ci."id_servicio" ' +
      'JOIN "Personal" tec  ON tec."id_personal" = ci."id_tecnico" ' +
      'JOIN "Negocios" neg  ON neg."id_negocio"  = tec."id_negocio" ' +
      'JOIN "Clientes" cli  ON cli."id_cliente"  = ci."id_cliente" ' +
      'JOIN "Usuarios" u_cli ON u_cli."id_usuario" = cli."id_usuario" ' +
      'JOIN "Usuarios" u_tec ON u_tec."id_usuario" = tec."id_usuario" ' +
      (where || "") +
      ' ORDER BY ci."fecha_cita", ci."hora_inicio"';

    const result = await db.query(sql, params);
    const rows = result.rows || [];

    return res.json(rows.map(mapCita));
  } catch (e) {
    console.error("Error en GET /Citas/by-role:", e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});
router.get("/", async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "false") === "true";
    const idCliente = req.query.idCliente ? Number(req.query.idCliente) : null;
    const idTecnico = req.query.idTecnico ? Number(req.query.idTecnico) : null;

    const cond = [];
    if (!includeInactive) cond.push(`"estado" <> 'cancelada'`);
    if (idCliente) cond.push(`"id_cliente" = ${idCliente}`);
    if (idTecnico) cond.push(`"id_tecnico" = ${idTecnico}`);
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";

    const { rows } = await db.query(
      `SELECT * FROM "Citas" ${where} ORDER BY "fecha_cita","hora_inicio"`
    );
    res.json(rows.map(mapCita));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});



router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM "Citas" WHERE "id_cita"=$1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).end();
    res.json(mapCita(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.post("/", async (req, res) => {
  try {
    const {
      idCliente, idTecnico, idServicio,
      fechaCita, horaInicio, horaFin, estado, motivoCancelacion
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO "Citas"
       ("id_cliente","id_tecnico","id_servicio","fecha_cita","hora_inicio","hora_fin","estado","motivo_cancelacion")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        idCliente, idTecnico, idServicio,
        fechaCita, horaInicio, horaFin, estado || "pendiente", motivoCancelacion || null
      ]
    );
    res.status(201).json(mapCita(rows[0]));
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.put("/:id", async (req, res) => {
  try {
    const {
      idCliente, idTecnico, idServicio,
      fechaCita, horaInicio, horaFin, estado, motivoCancelacion
    } = req.body;

    const { rowCount } = await db.query(
      `UPDATE "Citas"
       SET "id_cliente"=$1,"id_tecnico"=$2,"id_servicio"=$3,
           "fecha_cita"=$4,"hora_inicio"=$5,"hora_fin"=$6,
           "estado"=$7,"motivo_cancelacion"=$8
       WHERE "id_cita"=$9`,
      [
        idCliente, idTecnico, idServicio,
        fechaCita, horaInicio, horaFin, estado, motivoCancelacion || null,
        req.params.id
      ]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

/** Cancelación “soft”: dejamos todo igual pero estado='cancelada' y guardamos motivo */
router.patch("/:id/cancel", async (req, res) => {
  try {
    const { motivo } = req.body;
    const { rowCount } = await db.query(
      `UPDATE "Citas" SET "estado"='cancelada',"motivo_cancelacion"=$1 WHERE "id_cita"=$2`,
      [motivo || null, req.params.id]
    );
    if (!rowCount) return res.status(404).end();
    res.status(204).end();
  } catch (e) { res.status(500).json({ message: "Error", detail: String(e) }); }
});

router.patch("/:id/approve", /*authRequired,*/ async function (req, res) {
  try {
    var id = Number(req.params.id);
    if (!id || !Number.isInteger(id)) {
      return res.status(400).json({ message: "Id de cita inválido" });
    }

    // Opcional: podrías validar aquí que el estado actual no sea "cancelada"
    // con un SELECT previo, pero para mantenerlo simple hacemos solo UPDATE.

    var upd = await db.query(
      'UPDATE "Citas" ' +
        'SET "estado" = $2, ' +
        '    "motivo_cancelacion" = NULL, ' +
        '    "fecha_actualizacion" = NOW() ' +
        'WHERE "id_cita" = $1 ' +
        'RETURNING ' +
        '  "id_cita",' +
        '  "id_cliente",' +
        '  "id_tecnico",' +
        '  "id_servicio",' +
        '  "fecha_cita",' +
        '  "hora_inicio",' +
        '  "hora_fin",' +
        '  "estado",' +
        '  "motivo_cancelacion";',
      [id, "atendida"]
    );

    if (upd.rowCount === 0) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }

    var row = upd.rows[0];

    return res.json({
      idCita: row.id_cita,
      idCliente: row.id_cliente,
      idTecnico: row.id_tecnico,
      idServicio: row.id_servicio,
      fechaCita: row.fecha_cita,
      horaInicio: row.hora_inicio,
      horaFin: row.hora_fin,
      estado: row.estado,
      motivoCancelacion: row.motivo_cancelacion,
    });
  } catch (e) {
    console.error("Error en PATCH /Citas/:id/approve:", e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

////
// Confirmar o rechazar cita, y enviar notificación Expo
router.patch("/:id/estatus", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estatus, motivo, idUsuario } = req.body; // Ahora recibimos idUsuario desde el body

    if (!["confirmada", "rechazada"].includes(estatus)) {
      return res.status(400).json({
        message: "Estatus no válido. Usa 'confirmada' o 'rechazada'."
      });
    }

    // Verificar que el idUsuario sea 4 (cliente)
    if (idUsuario !== 4) {
      return res.status(403).json({
        message: "Solo los usuarios con id 4 (clientes) pueden cambiar el estatus de citas."
      });
    }

    // 1. Obtener datos de la cita usando idUsuario en lugar de idCliente
    const citaQuery = await db.query(
      `SELECT c."id_cita", c."id_cliente", c."id_tecnico", c."id_servicio", 
              c."fecha_cita", c."hora_inicio", c."hora_fin", c."estado",
              cli."id_usuario"
       FROM "Citas" c
       JOIN "Clientes" cli ON c."id_cliente" = cli."id_cliente"
       WHERE c."id_cita"=$1 AND cli."id_usuario"=$2`,
      [id, idUsuario]
    );

    if (!citaQuery.rows.length) {
      return res.status(404).json({ 
        message: "Cita no encontrada o no tienes permisos para modificarla" 
      });
    }

    const cita = citaQuery.rows[0];

    // 2. Actualizar cita en BD
    await db.query(
      `UPDATE "Citas"
       SET "estado"=$1,
           "motivo_cancelacion"=$2
       WHERE "id_cita"=$3`,
      [
        estatus,
        estatus === "rechazada" ? motivo || "Sin motivo" : null,
        id
      ]
    );

    // 3. Obtener token del usuario (cliente con id 4)
    const usuarioQuery = await db.query(
      `SELECT u."id_usuario", u."token"
       FROM "Usuarios" u
       WHERE u."id_usuario"=$1`,
      [idUsuario]
    );

    if (!usuarioQuery.rows.length) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const usuario = usuarioQuery.rows[0];
    const pushToken = usuario.token;

    // 4. Enviar notificación Expo
    if (pushToken) {
      try {
        const tituloNotificacion = estatus === "confirmada" 
          ? "Cita Confirmada" 
          : "Cita Rechazada";
        
        const mensajeNotificacion = estatus === "confirmada"
          ? "Tu cita ha sido confirmada. ¡Prepárate para tu servicio!"
          : `Motivo: ${motivo || "No especificado"}`;

        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            to: pushToken,
            title: tituloNotificacion,
            body: mensajeNotificacion,
            sound: "default",
            data: { 
              idCita: id, 
              idUsuario: idUsuario,
              estatus: estatus,
              tipo: 'cita_estatus'
            }
          })
        });
        
        console.log(`Notificación enviada a usuario ${idUsuario}`);
        
      } catch (notiError) {
        console.error("Error enviando notificación Expo:", notiError);
      }
    }

    return res.json({
      message: `Cita ${estatus}`,
      idCita: id,
      idUsuario: idUsuario,
      notificado: !!pushToken
    });
  } catch (e) {
    console.error("Error en PATCH /citas/:id/estatus:", e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});


module.exports = router;
