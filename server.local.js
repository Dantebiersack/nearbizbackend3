// server.local.js
const app = require("./server");

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`NearBiz Node API listening on http://localhost:${port}`);
});
