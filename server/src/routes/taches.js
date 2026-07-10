// Routes /taches : la seule transition exposée est la complétion (session + XP + recalibrage).
// Pas d'update générique : une séance générée par le plan ne se modifie pas à la main,
// et un PATCH libre permettrait de passer une tâche à "fait" sans XP ni recalibrage.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { CompleteTacheIn } = require("../validation/schemas");
const gam = require("../services/gamification");
const training = require("../services/training-plan");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// POST /taches/:id/complete — termine une tâche, logge la session et applique l'XP en une transaction.
router.post("/:id/complete", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = CompleteTacheIn.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const result = await prisma.$transaction(async (tx) => {
    const tache = await tx.tache.findFirst({
      where: { id, objectif: { domaine: { userId: req.userId } } },
      include: { objectif: { include: { domaine: true } } },
    });

    if (!tache) {
      const err = new Error("Tâche introuvable");
      err.status = 404;
      throw err;
    }
    if (tache.objectif.status !== "en_cours") {
      const err = new Error("Impossible de terminer une tâche d'un objectif terminé");
      err.status = 400;
      throw err;
    }
    const previousTaskCount = await tx.tache.count({
      where: {
        objectifId: tache.objectifId,
        orderIndex: { lt: tache.orderIndex },
        status: { not: "fait" },
      },
    });
    if (previousTaskCount > 0) {
      const err = new Error("Termine les séances précédentes avant celle-ci");
      err.status = 400;
      throw err;
    }

    const updated = await tx.tache.updateMany({
      where: { id, status: { not: "fait" } },
      data: { status: "fait", completedAt: new Date() },
    });
    if (updated.count === 0) {
      const err = new Error("Tâche déjà terminée");
      err.status = 400;
      throw err;
    }

    const { durationMinutes, selfRating, focusPoint, distanceKm, timeSeconds } = parsed.data;
    const effectiveDuration = durationMinutes ?? tache.estDurationMin ?? 30;
    const effectiveDifficulty = gam.taskDifficulty(tache.category);
    const xpEarned = gam.sessionXp({
      durationMinutes: effectiveDuration,
      difficulty: effectiveDifficulty,
      hasFeedback: false,
    });
    const next = gam.applyXpToDomaine(tache.objectif.domaine, xpEarned);
    const predictionSeconds = training.predictTimeSeconds({
      distanceKm,
      timeSeconds,
      targetDistanceKm: training.targetDistanceForObjective(tache.objectif),
    });
    const remainingTasks = await tx.tache.findMany({
      where: {
        objectifId: tache.objectifId,
        orderIndex: { gt: tache.orderIndex },
        status: "a_faire",
      },
    });
    const taskUpdates = training.recalibrateRemainingTasks(remainingTasks, {
      selfRating,
      predictionSeconds,
      targetTimeSeconds: tache.objectif.targetTimeSeconds,
      vmaKmh: tache.objectif.vmaKmh,
    });

    const session = await tx.session.create({
      data: {
        durationMinutes: effectiveDuration,
        distanceKm: distanceKm ?? null,
        timeSeconds: timeSeconds ?? null,
        difficulty: effectiveDifficulty,
        selfRating: selfRating ?? null,
        focusPoint: focusPoint ?? tache.title,
        tacheId: id,
        xpEarned,
        objectifId: tache.objectifId,
      },
    });

    if (predictionSeconds != null) {
      await tx.objectif.update({
        where: { id: tache.objectifId },
        data: { predictionSeconds },
      });
    }
    for (const update of taskUpdates) {
      await tx.tache.update({ where: { id: update.id }, data: update.data });
    }

    const domaine = await tx.domaine.update({
      where: { id: tache.objectif.domaineId },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
        totalMinutes: tache.objectif.domaine.totalMinutes + effectiveDuration,
      },
    });

    const completedTache = await tx.tache.findUnique({ where: { id } });

    return {
      tache: completedTache,
      session,
      xpEarned,
      predictionSeconds,
      adjustedTasks: taskUpdates.length,
      leveledUp: next.leveledUp,
      newLevels: next.newLevels,
      domaine,
    };
  });

  res.status(201).json(result);
}));

// PATCH /taches/:id — modifier uniquement le contenu éditorial.
router.patch("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = TacheUpdateIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (!(await findTache(req.userId, id))) {
    return res.status(404).json({ error: "Tâche introuvable" });
  }

  const data = { ...parsed.data };
  // Horodatage automatique quand la tâche passe à "fait".
  if (data.status === "fait") data.completedAt = new Date();
  if (data.status && data.status !== "fait") data.completedAt = null;

  const tache = await prisma.tache.update({ where: { id }, data });
  res.json(tache);
}));

module.exports = router;
