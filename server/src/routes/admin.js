// Routes /admin : réservées au rôle admin (seedé via `npm run db:seed`, jamais créé par /auth/register).
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth, requireRole("admin"));

// GET /admin/users — liste des coureurs avec leurs stats de progression.
router.get("/users", asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      createdAt: true,
      domaines: {
        select: {
          level: true,
          totalXp: true,
          totalMinutes: true,
          _count: { select: { objectifs: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  res.json(
    users.map((u) => {
      const d = u.domaines[0] || null;
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        level: d?.level ?? 0,
        totalXp: d?.totalXp ?? 0,
        totalMinutes: d?.totalMinutes ?? 0,
        objectifsCount: d?._count.objectifs ?? 0,
      };
    })
  );
}));

// GET /admin/stats — agrégats globaux de la plateforme.
router.get("/stats", asyncHandler(async (req, res) => {
  const [users, objectifs, sessions, minutes] = await Promise.all([
    prisma.user.count(),
    prisma.objectif.count(),
    prisma.session.count(),
    prisma.domaine.aggregate({ _sum: { totalMinutes: true } }),
  ]);

  res.json({
    users,
    objectifs,
    sessions,
    totalMinutes: minutes._sum.totalMinutes ?? 0,
  });
}));

module.exports = router;
