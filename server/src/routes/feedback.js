// Routes /sessions : ajout d'un feedback à une session (+ bonus XP différentiel ×1.5).
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findSession } = require("../access");
const { FeedbackIn } = require("../validation/schemas");
const gam = require("../services/gamification");

const router = express.Router();
router.use(auth);

// POST /sessions/:id/feedback — ajoute un feedback et applique le bonus différentiel.
router.post("/:id/feedback", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = FeedbackIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const session = await findSession(req.userId, id);
  if (!session) return res.status(404).json({ error: "Session introuvable" });

  const existing = await prisma.feedback.findUnique({ where: { sessionId: id } });
  if (existing) {
    return res.status(400).json({ error: "Feedback déjà présent pour cette session" });
  }

  // Bonus différentiel : recalcule l'XP de la session avec feedback, applique l'écart.
  const newXp = gam.sessionXp({
    durationMinutes: session.durationMinutes,
    difficulty: session.difficulty,
    hasFeedback: true,
  });
  const bonus = newXp - session.xpEarned;

  const objectif = await prisma.objectif.findUnique({ where: { id: session.objectifId } });
  const domaine = await prisma.domaine.findUnique({ where: { id: objectif.domaineId } });
  const next = gam.applyXpToDomaine(domaine, bonus);

  const [feedback, updatedSession, updatedDomaine] = await prisma.$transaction([
    prisma.feedback.create({ data: { ...parsed.data, sessionId: id } }),
    prisma.session.update({ where: { id }, data: { xpEarned: newXp } }),
    prisma.domaine.update({
      where: { id: domaine.id },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
      },
    }),
  ]);

  res.status(201).json({
    feedback,
    session: updatedSession,
    bonusXp: bonus,
    leveledUp: next.leveledUp,
    newLevels: next.newLevels,
    domaine: updatedDomaine,
  });
});

module.exports = router;
