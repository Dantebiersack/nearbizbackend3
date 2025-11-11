// src/utils/respond.js
function created(res, location, body) {
  if (location) res.setHeader("Location", location);
  return res.status(201).json(body ?? {});
}
function noContent(res) {
  return res.status(204).send();
}
module.exports = { created, noContent };
