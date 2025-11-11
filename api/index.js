// api/index.js
const app = require("../src/app");

// Vercel espera una función (req, res)
// Express es compatible: podemos pasar app como handler.
module.exports = (req, res) => app(req, res);
