// Middleware d'autorisation par rôle — à monter APRÈS auth (req.userRole doit exister).
// 403 (et non 401) : l'utilisateur est authentifié mais n'a pas les droits.
function requireRole(role) {
  return (req, res, next) => {
    if (req.userRole !== role) {
      return res.status(403).json({ error: `Accès réservé au rôle ${role}` });
    }
    next();
  };
}

module.exports = requireRole;
