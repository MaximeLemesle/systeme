// Routes /me : stats agrégées de l'utilisateur.
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

module.exports = router;
