// src/utils/case.js
function toPascalCaseKey(k) {
  if (!k) return k;
  return k.charAt(0).toUpperCase() + k.slice(1);
}
function toPascal(obj) {
  if (Array.isArray(obj)) return obj.map(toPascal);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[toPascalCaseKey(k)] = toPascal(v);
    }
    return out;
  }
  return obj;
}

module.exports = { toPascal };
