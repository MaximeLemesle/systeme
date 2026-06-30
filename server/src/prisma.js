// Client Prisma singleton — réutilisé par toutes les routes/services.
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

module.exports = prisma;
