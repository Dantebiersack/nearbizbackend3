// src/routes/usuarios.route.js
const { Router } = require("express");
const db = require("../db");
const { toPascal } = require("../utils/case");
const { created, noContent } = require("../utils/respond");
// const { authRequired, allowRoles } = require("../middleware/auth"); // si los quieres proteger

const router = Router();

// GET all
router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    const q = includeInactive
      ? `SELECT "id_usuario","nombre","email","id_rol","fecha_registro","estado","token" FROM "Usuarios" ORDER BY "id_usuario";`
      : `SELECT "id_usuario","nombre","email","id_rol","fecha_registro","estado","token" FROM "Usuarios" WHERE "estado"=TRUE ORDER BY "id_usuario";`;

    const { rows } = await db.query(q);
    // Mapea a PascalCase como en UsuarioReadDto(.NET)
    const data = rows.map(r => ({
      IdUsuario: r.id_usuario,
      Nombre: r.nombre,
      Email: r.email,
      IdRol: r.id_rol,
      FechaRegistro: r.fecha_registro,
      Estado: r.estado,
      Token: r.token
    }));
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// Cambia la ruta a /registroapp
router.post("/registroapp", async (req, res) => {
  try {
    const dto = req.body;
    
    // 1. Insertar usuario
    const ins = await db.query(
      `INSERT INTO "Usuarios"("nombre","email","contrasena_hash","id_rol","estado","token")
       VALUES($1,$2,$3,$4,TRUE,$5)
       RETURNING "id_usuario","nombre","email","id_rol","fecha_registro","estado","token";`,
      [dto.Nombre, dto.Email, dto.ContrasenaHash, dto.IdRol, dto.Token || null]
    );
    
    const e = ins.rows[0];
    const body = {
      IdUsuario: e.id_usuario,
      Nombre: e.nombre,
      Email: e.email,
      IdRol: e.id_rol,
      FechaRegistro: e.fecha_registro,
      Estado: e.estado,
      Token: e.token
    };

    // 2. Si el rol es 4 (cliente), crear registro en tabla Clientes
    if (dto.IdRol === 4) {
      const clienteIns = await db.query(
        `INSERT INTO "Clientes" ("id_usuario", "estado")
         VALUES ($1, TRUE)
         RETURNING "id_cliente", "id_usuario", "estado"`,
        [e.id_usuario]
      );
      
      const cliente = clienteIns.rows[0];
      console.log(`✅ Cliente creado - ID Cliente: ${cliente.id_cliente}, ID Usuario: ${cliente.id_usuario}`);
      
      body.Cliente = {
        IdCliente: cliente.id_cliente,
        IdUsuario: cliente.id_usuario,
        Estado: cliente.estado
      };
    }
    
    return created(res, `/api/registroapp/${e.id_usuario}`, body);
  } catch (e) {
    console.error('Error al crear usuario:', e);
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});


// GET by id
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `SELECT "id_usuario","nombre","email","id_rol","fecha_registro","estado","token"
       FROM "Usuarios" WHERE "id_usuario"=$1;`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Not found" });
    const r = rows[0];
    return res.json({
      IdUsuario: r.id_usuario,
      Nombre: r.nombre,
      Email: r.email,
      IdRol: r.id_rol,
      FechaRegistro: r.fecha_registro,
      Estado: r.estado,
      Token: r.token
    });
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// POST create
router.post("/", async (req, res) => {
  try {
    // DTO estilo .NET
    const dto = req.body; // { Nombre, Email, ContrasenaHash, IdRol, Token }
    const ins = await db.query(
      `INSERT INTO "Usuarios"("nombre","email","contrasena_hash","id_rol","estado","token")
       VALUES($1,$2,$3,$4,TRUE,$5)
       RETURNING "id_usuario","nombre","email","id_rol","fecha_registro","estado","token";`,
      [dto.Nombre, dto.Email, dto.ContrasenaHash, dto.IdRol, dto.Token || null]
    );
    const e = ins.rows[0];
    const body = {
      IdUsuario: e.id_usuario,
      Nombre: e.nombre,
      Email: e.email,
      IdRol: e.id_rol,
      FechaRegistro: e.fecha_registro,
      Estado: e.estado,
      Token: e.token
    };
    return created(res, `/api/Usuarios/${e.id_usuario}`, body);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PUT update
router.put("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dto = req.body; // { Nombre, Email, IdRol, Token }
    await db.query(
      `UPDATE "Usuarios" SET "nombre"=$1,"email"=$2,"id_rol"=$3,"token"=$4
       WHERE "id_usuario"=$5;`,
      [dto.Nombre, dto.Email, dto.IdRol, dto.Token ?? null, id]
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
    await db.query(`UPDATE "Usuarios" SET "estado"=FALSE WHERE "id_usuario"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// PATCH restore
router.patch("/:id(\\d+)/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Usuarios" SET "estado"=TRUE WHERE "id_usuario"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});




module.exports = router;
