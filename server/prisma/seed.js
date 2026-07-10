// Seed de l'admin — seule façon d'obtenir un compte admin (register force role=user).
// Usage : npm run db:seed (identifiants surchargables via ADMIN_EMAIL / ADMIN_PASSWORD).
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@coach.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123!";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "admin" },
    create: {
      username: "admin",
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      // Sans domaine, le front n'a rien à afficher pour ce compte.
      domaines: { create: { name: "Course à pied" } },
    },
  });
  console.log(`Admin prêt : ${admin.email} (id ${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
