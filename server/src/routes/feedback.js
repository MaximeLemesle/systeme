// Routes /sessions : ajout d'un feedback à une session (+ bonus XP différentiel ×1.5).
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findSession } = require("../access");
const { FeedbackIn } = require("../validation/schemas");
const gam = require("../services/gamification");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// POST /sessions/:id/feedback — ajoute un feedback et applique le bonus différentiel.
router.post("/:id/feedback", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = FeedbackIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  // Transaction interactive : contrôles + calcul + écritures atomiques
  // (pas de double feedback ni d'XP perdue en cas de requêtes simultanées).
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findFirst({
      where: { id, objectif: { domaine: { userId: req.userId } } },
      include: { feedback: true, objectif: { include: { domaine: true } } },
    });
    if (!session) {
      const err = new Error("Session introuvable");
      err.status = 404;
      throw err;
    }
    if (session.feedback) {
      const err = new Error("Feedback déjà présent pour cette session");
      err.status = 400;
      throw err;
    }

    // Bonus différentiel : recalcule l'XP de la session avec feedback, applique l'écart.
    const newXp = gam.sessionXp({
      durationMinutes: session.durationMinutes,
      difficulty: session.difficulty,
      hasFeedback: true,
    });
    const bonus = newXp - session.xpEarned;
    const next = gam.applyXpToDomaine(session.objectif.domaine, bonus);

    const feedback = await tx.feedback.create({ data: { ...parsed.data, sessionId: id } });
    const updatedSession = await tx.session.update({ where: { id }, data: { xpEarned: newXp } });
    const updatedDomaine = await tx.domaine.update({
      where: { id: session.objectif.domaineId },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
      },
    });

    return { feedback, session: updatedSession, bonusXp: bonus, leveledUp: next.leveledUp, newLevels: next.newLevels, domaine: updatedDomaine };
  });

  res.status(201).json(result);
}));

module.exports = router;
