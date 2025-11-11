// server.local.js
require("dotenv").config();
const app = require("./src/app");

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`NearBiz Node API listening on http://localhost:${port}`);
  console.log('DATABASE_URL typeof:', typeof process.env.DATABASE_URL);
  console.log((process.env.DATABASE_URL || '').slice(0, 30) + '...'); 

});
