// src/routes/auth.route.js
const { Router } = require("express");
const db = require("../db");
const { signJwt } = require("../utils/jwt"); // 👈 importa la función correcta

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { userOrEmail, password } = req.body;

    const { rows } = await db.query(
      `
      SELECT u."id_usuario", u."nombre", u."email", r."rol"
      FROM "Usuarios" u
      JOIN "Roles" r ON r."id_rol" = u."id_rol"
      WHERE (LOWER(u."email") = LOWER($1) OR LOWER(u."nombre") = LOWER($1))
        AND u."contrasena_hash" = $2
        AND u."estado" = TRUE
      LIMIT 1;
      `,
      [userOrEmail, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const u = rows[0];

    // No pongas "exp" manual si ya usas expiresIn en el helper
    const token = signJwt({ sub: u.id_usuario, rol: u.rol });

    // Si aún quieres regresar un ISO con la expiración:
    const expSeconds = Math.floor(Date.now() / 1000) +
                       (parseDuration(process.env.JWT_EXPIRES_IN || "1d"));
    return res.json({
      Token: token,
      Nombre: u.nombre,
      Rol: u.rol,
      IdUsuario: u.id_usuario,
      Expira: new Date(expSeconds * 1000).toISOString(),
      Email: u.email,
    });
  } catch (err) {
    return res.status(500).json({ message: "Login error", detail: String(err) });
  }
});

// util mínimo para convertir "1d" | "12h" | "3600" a segundos
function parseDuration(v) {
  if (/^\d+$/.test(v)) return parseInt(v, 10);      // "3600"
  const m = /^(\d+)([smhd])$/.exec(v);              // "1d", "12h"
  if (!m) return 86400;
  const n = parseInt(m[1], 10);
  return { s:1, m:60, h:3600, d:86400 }[m[2]] * n;
}

module.exports = router;
