function requireRole(role) {
  return (req, res, next) => {
    if (req.userRole !== role) {
      return res.status(403).json({ error: "Accès interdit" });
    }
    next();
  };
}

module.exports = requireRole;
