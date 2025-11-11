// src/routes/auth.route.js
const { Router } = require("express");
const db = require("../db");
const { signJwt } = require("../utils/jwt");

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { userOrEmail, password } = req.body;

    // 1) SELECT del usuario
    const sel = await db.query(
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

    if (sel.rows.length === 0) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const u = sel.rows[0];
    // por si viene como string de Postgres, fuerza a int
    const userId = Number(u.id_usuario);

    const token = signJwt({ sub: userId, rol: u.rol });

    // 2) UPDATE con RETURNING para comprobar que escribió
    const upd = await db.query(
      `UPDATE "Usuarios" SET "token" = $1 WHERE "id_usuario" = $2 RETURNING "id_usuario","token";`,
      [token, userId]
    );

    console.log("UPDATE rowCount:", upd.rowCount, "returned:", upd.rows);

    // 3) Lee inmediatamente para confirmar lo escrito
    const chk = await db.query(
      `SELECT "token" FROM "Usuarios" WHERE "id_usuario" = $1;`,
      [userId]
    );

    console.log("Post-UPDATE token:", chk.rows[0]?.token?.slice(0, 24), "...");

    // 4) Si no afectó filas, dilo explícito (es señal de DB equivocada o id no matchea)
    if (upd.rowCount === 0) {
      return res.status(500).json({
        message: "No se actualizó el token",
        hint: "rowCount=0 (id no coincide o DB distinta)",
        debug: { userId }
      });
    }

    // 5) Expira solo para UI
    const expSeconds = Math.floor(Date.now() / 1000) + parseDuration(process.env.JWT_EXPIRES_IN || "1d");

    return res.json({
      Token: token,
      Nombre: u.nombre,
      Rol: u.rol,
      IdUsuario: userId,
      Expira: new Date(expSeconds * 1000).toISOString(),
      Email: u.email,
      // Para debug temporal (quítalo luego)
      _debug: { updateRowCount: upd.rowCount }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Login error", detail: String(err) });
  }
});

function parseDuration(v) {
  if (/^\d+$/.test(v)) return parseInt(v, 10);
  const m = /^(\d+)([smhd])$/.exec(v);
  if (!m) return 86400;
  const n = parseInt(m[1], 10);
  return { s:1, m:60, h:3600, d:86400 }[m[2]] * n;
}

module.exports = router;
