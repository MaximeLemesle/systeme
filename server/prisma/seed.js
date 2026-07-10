const bcrypt = require("bcryptjs");
const prisma = require("../src/prisma");

const TEST_PASSWORD = "Test123!";

// Compte admin : seule façon d'obtenir le rôle admin (register force toujours "user").
// Surchargable via ADMIN_EMAIL / ADMIN_PASSWORD (voir server/.env.example).
const ADMIN = {
  username: "Admin",
  email: process.env.ADMIN_EMAIL || "admin@coach.local",
  password: process.env.ADMIN_PASSWORD || "admin123!",
};

const TEST_RUNNERS = [
  {
    username: "Lucas Martin",
    email: "lucas@test.local",
    objectif: {
      title: "Courir 10 km en moins de 50 minutes",
      description: "Niveau de départ : Intermédiaire",
      metricLabel: "distance",
      unit: "km",
      targetValue: 10,
      targetDistanceKm: 10,
      targetTimeSeconds: 3000,
      difficulty: "moyen",
      niveau: "Intermédiaire",
      objectiveType: "chrono",
      trainingFrequency: 3,
      planWeeks: 8,
    },
  },
  {
    username: "Emma Dupont",
    email: "emma@test.local",
    objectif: {
      title: "Courir son premier marathon",
      description: "Niveau de départ : Débutante sur longue distance",
      metricLabel: "distance",
      unit: "km",
      targetValue: 42.195,
      targetDistanceKm: 42.195,
      difficulty: "difficile",
      niveau: "Débutante sur longue distance",
      objectiveType: "distance",
      trainingFrequency: 4,
      planWeeks: 20,
    },
  },
  {
    username: "Hugo Bernard",
    email: "hugo@test.local",
    objectif: {
      title: "Courir 5 km en moins de 25 minutes",
      description: "Niveau de départ : Débutant régulier",
      metricLabel: "distance",
      unit: "km",
      targetValue: 5,
      targetDistanceKm: 5,
      targetTimeSeconds: 1500,
      difficulty: "moyen",
      niveau: "Débutant régulier",
      objectiveType: "chrono",
      trainingFrequency: 3,
      planWeeks: 8,
    },
  },
];

async function seedRunner(runner, passwordHash) {
  const user = await prisma.user.upsert({
    where: { email: runner.email },
    update: { username: runner.username, passwordHash, role: "user" },
    create: {
      username: runner.username,
      email: runner.email,
      passwordHash,
      role: "user",
    },
  });

  const domaine = await prisma.domaine.upsert({
    where: { userId: user.id },
    update: { name: "Course à pied", description: "Parcours d'entraînement Running Club" },
    create: {
      userId: user.id,
      name: "Course à pied",
      description: "Parcours d'entraînement Running Club",
    },
  });

  const existing = await prisma.objectif.findFirst({
    where: { domaineId: domaine.id, title: runner.objectif.title },
  });
  if (!existing) {
    await prisma.objectif.create({
      data: { ...runner.objectif, domaineId: domaine.id },
    });
  }
}

async function seedTestRunners() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  for (const runner of TEST_RUNNERS) {
    await seedRunner(runner, passwordHash);
  }
}

// Crée (ou remet à jour) le compte administrateur et son domaine.
async function seedAdmin() {
  const passwordHash = await bcrypt.hash(ADMIN.password, 10);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN.email },
    update: { username: ADMIN.username, passwordHash, role: "admin" },
    create: { username: ADMIN.username, email: ADMIN.email, passwordHash, role: "admin" },
  });
  // Le front attend un domaine pour tout compte connecté, admin compris.
  await prisma.domaine.upsert({
    where: { userId: admin.id },
    update: { name: "Course à pied" },
    create: { userId: admin.id, name: "Course à pied", description: "Espace administrateur Running Club" },
  });
  return admin;
}

async function main() {
  await seedTestRunners();
  const admin = await seedAdmin();
  console.log(`Comptes de test prêts : ${TEST_RUNNERS.map((runner) => runner.email).join(", ")}`);
  console.log(`Compte admin prêt : ${admin.email}`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { TEST_PASSWORD, TEST_RUNNERS, ADMIN, seedTestRunners, seedAdmin };
