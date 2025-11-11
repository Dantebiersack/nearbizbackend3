const express = require("express");
const router = express.Router();
const { query } = require("../db");
const { signJwt, decodeJwt } = require("../utils/jwt");

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { userOrEmail, password } = req.body || {};
    if (!userOrEmail || !password) {
      return res.status(400).json({ message: "Body inválido: { userOrEmail, password }" });
    }

    // Busca usuario activo por email o nombre
    // Si tu columna es "contraseña_hash", cambia u."contrasena_hash" por u."contraseña_hash"
    const sql = `
      SELECT 
        u.id_usuario      AS "IdUsuario",
        u.nombre          AS "Nombre",
        u.email           AS "Email",
        u.contrasena_hash AS "ContrasenaHash",
        u.id_rol          AS "IdRol",
        u.estado          AS "Estado",
        r.rol             AS "RolNombre"
      FROM "Usuarios" u
      LEFT JOIN "Roles" r ON r.id_rol = u.id_rol
      WHERE u.estado = true
        AND (u.email = $1 OR u.nombre = $1)
      LIMIT 1;
    `;

    const rs = await query(sql, [userOrEmail]);
    const user = rs.rows[0];
    if (!user) {
      return res.status(401).json({ message: "Usuario o contraseña inválidos" });
    }

    // Comparación plana (igual que tu back actual)
    if (user.ContrasenaHash !== password) {
      return res.status(401).json({ message: "Usuario o contraseña inválidos" });
    }

    const rol = user.RolNombre || "negocio";

    // JWT (1 día)
    const token = signJwt({
      sub: String(user.IdUsuario),
      unique_name: user.Nombre,
      role: rol,
    });
    const decoded = decodeJwt(token);
    const expUnix = decoded?.payload?.exp ?? null;
    const expira = expUnix ? new Date(expUnix * 1000).toISOString() : null;

    // Guardar token (opcional)
    await query(
      `UPDATE public."Usuarios" SET token = $1 WHERE id_usuario = $2;`,
      [token, user.IdUsuario]
    );

    // Respuesta tal como tu front espera (PascalCase)
    return res.json({
      Token: token,
      Expira: expira,
      Nombre: user.Nombre,
      IdUsuario: user.IdUsuario,
      Rol: rol,
      Email: user.Email,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login error", detail: String(err) });
  }
});

module.exports = router;
