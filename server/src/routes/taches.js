// Routes /taches : modifier / cocher une tâche.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findTache } = require("../access");
const { TacheUpdateIn, CompleteTacheIn } = require("../validation/schemas");
const gam = require("../services/gamification");
const prediction = require("../services/prediction");
const planGenerator = require("../services/planGenerator");
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

    const updated = await tx.tache.updateMany({
      where: { id, status: { not: "fait" } },
      data: { status: "fait", completedAt: new Date() },
    });
    if (updated.count === 0) {
      const err = new Error("Tâche déjà terminée");
      err.status = 400;
      throw err;
    }

    const { durationMinutes, selfRating, focusPoint, perfDistanceKm, perfDurationSec } = parsed.data;
    const effectiveDuration = durationMinutes ?? tache.estDurationMin ?? 30;
    const effectiveDifficulty = gam.taskDifficulty(tache.templateKey);
    const xpEarned = gam.sessionXp({
      durationMinutes: effectiveDuration,
      difficulty: effectiveDifficulty,
      hasFeedback: false,
    });
    const next = gam.applyXpToDomaine(tache.objectif.domaine, xpEarned);

    const session = await tx.session.create({
      data: {
        durationMinutes: effectiveDuration,
        difficulty: effectiveDifficulty,
        selfRating: selfRating ?? null,
        focusPoint: focusPoint ?? tache.title,
        tacheId: id,
        xpEarned,
        objectifId: tache.objectifId,
        perfDistanceKm: perfDistanceKm ?? null,
        perfDurationSec: perfDurationSec ?? null,
      },
    });

    const domaine = await tx.domaine.update({
      where: { id: tache.objectif.domaineId },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
        totalMinutes: tache.objectif.domaine.totalMinutes + effectiveDuration,
      },
    });

    // Prédiction : si une perf réelle est fournie, on recalcule l'estimation courante (serveur,
    // déterministe), puis on recalibre silencieusement les allures des séances restantes.
    let objectif = tache.objectif;
    const est = prediction.updateEstimate(objectif, {
      distanceKm: perfDistanceKm,
      durationSec: perfDurationSec,
    });
    if (est) {
      objectif = await tx.objectif.update({
        where: { id: tache.objectifId },
        data: { currentValue: est.currentValue, estimateUpdatedAt: new Date() },
      });

      const remaining = await tx.tache.findMany({
        where: { objectifId: tache.objectifId, status: "a_faire" },
      });
      const updates = planGenerator.recalibrate(objectif, remaining);
      for (const u of updates) {
        await tx.tache.update({
          where: { id: u.id },
          data: { spec: u.spec, targetLabel: u.targetLabel, estDurationMin: u.estDurationMin },
        });
      }
    }

    const completedTache = await tx.tache.findUnique({ where: { id } });

    return {
      tache: completedTache,
      session,
      xpEarned,
      leveledUp: next.leveledUp,
      newLevels: next.newLevels,
      domaine,
      prediction: est ? prediction.predictionPayload(objectif) : null,
    };
  });

  res.status(201).json(result);
}));

// PATCH /taches/:id — modifier (ex : status "fait")
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
