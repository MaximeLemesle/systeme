// Helpers d'accès : récupèrent une ressource UNIQUEMENT si elle appartient au user.
// Renvoient null sinon (la route répond alors 404).
const prisma = require("./prisma");

function findDomaine(userId, id) {
  return prisma.domaine.findFirst({ where: { id, userId } });
}

function findObjectif(userId, id) {
  return prisma.objectif.findFirst({
    where: { id, domaine: { userId } },
  });
}

function findSession(userId, id) {
  return prisma.session.findFirst({
    where: { id, objectif: { domaine: { userId } } },
  });
}

module.exports = { findDomaine, findObjectif, findSession };
