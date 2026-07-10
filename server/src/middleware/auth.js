// Middleware d'authentification : vérifie le header "Authorization: Bearer <jwt>"
// et attache req.userId. Renvoie 401 si absent/invalide.
const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Token manquant" });
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.userId = payload.userId;
    req.userRole = payload.role || "user"; // tokens émis avant l'ajout des rôles = user
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide" });
  }
}

module.exports = auth;
