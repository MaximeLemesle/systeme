// Routes /me : stats agrégées + accès au domaine unique "Course à pied".
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { masteryPercent } = require("../services/gamification");

const router = express.Router();
router.use(auth);

// Garantit que l'utilisateur a son domaine "Course à pied" (app mono-domaine).
async function ensureCourseDomaine(userId) {
  let domaine = await prisma.domaine.findFirst({
    where: { userId, name: "Course à pied" },
  });
  if (!domaine) {
    domaine = await prisma.domaine.create({
      data: { name: "Course à pied", description: "Ta progression en course", userId },
    });
  }
  return domaine;
}

// GET /me/stats
router.get("/stats", async (req, res) => {
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
});

// GET /me/course — le domaine Course + l'objectif actif (avec son plan d'entraînement) + l'historique.
router.get("/course", async (req, res, next) => {
  try {
    // Token valide mais utilisateur absent (session obsolète) → 401 propre, pas de crash.
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(401).json({ error: "Session expirée, reconnecte-toi." });
    }

    const domaine = await ensureCourseDomaine(req.userId);

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
  } catch (e) {
    next(e); // → middleware d'erreur (500 JSON), jamais de crash process
  }
});

module.exports = router;
