
const { Router } = require("express");
const db = require("../db");
const { created, noContent } = require("../utils/respond");

const router = Router();

const mapToDto = (row) => ({
  IdCategoria: row.id_categoria,
  NombreCategoria: row.nombre_categoria,
  Estado: row.estado
});

// GET all
router.get("/", async (req, res) => {
  try {
    const includeInactive = (req.query.includeInactive || "false").toLowerCase() === "true";
    
    const q = includeInactive
      ? `SELECT "id_categoria", "nombre_categoria", "estado" FROM "Categorias" ORDER BY "id_categoria";`
      : `SELECT "id_categoria", "nombre_categoria", "estado" FROM "Categorias" WHERE "estado"=TRUE ORDER BY "id_categoria";`;

    const { rows } = await db.query(q);
    const data = rows.map(mapToDto);
    
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// GET 
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await db.query(
      `SELECT "id_categoria", "nombre_categoria", "estado" 
       FROM "Categorias" WHERE "id_categoria"=$1;`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: "Not found" });
    
    return res.json(mapToDto(rows[0]));
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// Create
router.post("/", async (req, res) => {
  try {
    const dto = req.body; 
    
    const ins = await db.query(
      `INSERT INTO "Categorias"("nombre_categoria", "estado")
       VALUES($1, TRUE)
       RETURNING "id_categoria", "nombre_categoria", "estado";`,
      [dto.NombreCategoria]
    );

    const createdDto = mapToDto(ins.rows[0]);
    return created(res, `/api/Categorias/${createdDto.IdCategoria}`, createdDto);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// Update
router.put("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const dto = req.body; 

    await db.query(
      `UPDATE "Categorias" SET "nombre_categoria"=$1 WHERE "id_categoria"=$2;`,
      [dto.NombreCategoria, id]
    );

    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

// DELETE
router.delete("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Categorias" SET "estado"=FALSE WHERE "id_categoria"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

router.patch("/:id(\\d+)/restore", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query(`UPDATE "Categorias" SET "estado"=TRUE WHERE "id_categoria"=$1;`, [id]);
    return noContent(res);
  } catch (e) {
    return res.status(500).json({ message: "Error", detail: String(e) });
  }
});

module.exports = router;