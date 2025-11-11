// src/server.local.js (solo dev local)
import "dotenv/config";
import app from "./app.js";
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Dev on http://localhost:${port}`));
