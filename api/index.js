// api/index.js
import serverless from "serverless-http";
import app from "../src/app.js";

// Vercel requiere export default de una función (req,res)
// serverless-http adapta Express a ese handler
export default serverless(app);
