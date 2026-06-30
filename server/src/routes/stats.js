// Routes /me : stats agrégées. /me/course reste en compatibilité ancienne UI.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { masteryPercent } = require("../services/gamification");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// GET /me/stats
router.get("/stats", asyncHandler(async (req, res) => {
  const domaines = await prisma.domaine.findMany({ where: { userId: req.userId } });

  const totalMinutes = domaines.reduce((s, d) => s + d.totalMinutes, 0);
  const totalLevels = domaines.reduce((s, d) => s + d.level, 0);

  res.json({
    domaineCount: domaines.length,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10,
    cumulatedLevels: totalLevels,
    masteryPercent: Math.round(masteryPercent(totalMinutes) * 100) / 100,
  });
}));

// GET /me/course — compatibilité : renvoie le domaine "Course à pied" s'il existe, sinon le premier.
router.get("/course", asyncHandler(async (req, res) => {
    // Token valide mais utilisateur absent (session obsolète) → 401 propre, pas de crash.
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(401).json({ error: "Session expirée, reconnecte-toi." });
    }

    const domaine =
      (await prisma.domaine.findFirst({
        where: { userId: req.userId, name: "Course à pied" },
      })) ||
      (await prisma.domaine.findFirst({
        where: { userId: req.userId },
        orderBy: { createdAt: "asc" },
      }));

    if (!domaine) {
      return res.json({ domaine: null, objectifs: [], objectifActif: null });
    }

    const objectifs = await prisma.objectif.findMany({
      where: { domaineId: domaine.id },
      orderBy: { createdAt: "desc" },
    });

    const objectifActif = await prisma.objectif.findFirst({
      where: { domaineId: domaine.id, status: "en_cours" },
      orderBy: { createdAt: "desc" },
      include: {
        taches: { orderBy: { orderIndex: "asc" } },
        sessions: { orderBy: { createdAt: "desc" }, include: { feedback: true } },
      },
    });

    res.json({ domaine, objectifs, objectifActif });
}));

module.exports = router;
