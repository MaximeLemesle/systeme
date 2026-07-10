const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth, requireRole("admin"));

router.get("/users", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      domaines: {
        select: { level: true, totalXp: true, totalMinutes: true },
      },
    },
  });
  res.json(users.map(({ domaines, ...user }) => ({
    ...user,
    level: domaines[0]?.level ?? 1,
    totalXp: domaines[0]?.totalXp ?? 0,
    totalMinutes: domaines[0]?.totalMinutes ?? 0,
  })));
}));

router.get("/stats", asyncHandler(async (_req, res) => {
  const [users, domaines, objectifs, sessions] = await Promise.all([
    prisma.user.count(),
    prisma.domaine.count(),
    prisma.objectif.count(),
    prisma.session.count(),
  ]);
  res.json({ users, domaines, objectifs, sessions });
}));

module.exports = router;
