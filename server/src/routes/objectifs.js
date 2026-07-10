// Routes /objectifs : détail, modif, validation, génération IA des tâches, sessions.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findObjectif } = require("../access");
const { ObjectifUpdateIn, SessionIn } = require("../validation/schemas");
const planGenerator = require("../services/planGenerator");
const gam = require("../services/gamification");
const prediction = require("../services/prediction");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// GET /objectifs/:id — détail + tâches + sessions
router.get("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const objectif = await prisma.objectif.findFirst({
    where: { id, domaine: { userId: req.userId } },
    include: {
      taches: { orderBy: { orderIndex: "asc" } },
      sessions: { orderBy: { createdAt: "desc" }, include: { feedback: true } },
      domaine: true,
    },
  });
  if (!objectif) return res.status(404).json({ error: "Objectif introuvable" });
  res.json(objectif);
}));

// PUT /objectifs/:id — modifier le titre/la description (le reste est piloté par le serveur)
router.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = ObjectifUpdateIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (!(await findObjectif(req.userId, id))) {
    return res.status(404).json({ error: "Objectif introuvable" });
  }
  const objectif = await prisma.objectif.update({ where: { id }, data: parsed.data });
  res.json(objectif);
}));

// DELETE /objectifs/:id — supprimer
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findObjectif(req.userId, id))) {
    return res.status(404).json({ error: "Objectif introuvable" });
  }
  await prisma.objectif.delete({ where: { id } });
  res.json({ ok: true });
}));

// PATCH /objectifs/:id/validate — valider → gros gain d'XP au domaine
router.patch("/:id/validate", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const objectif = await findObjectif(req.userId, id);
  if (!objectif) return res.status(404).json({ error: "Objectif introuvable" });
  if (objectif.status !== "en_cours") {
    return res.status(400).json({ error: "Seul un objectif en cours peut être validé" });
  }

  const gained = gam.validationXp(objectif.difficulty);

  // Transaction interactive : la double validation simultanée est bloquée par le
  // updateMany conditionnel, et l'XP est lue/écrite atomiquement.
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.objectif.updateMany({
      where: { id, status: "en_cours" },
      data: { status: "valide", validatedAt: new Date() },
    });
    if (updated.count === 0) {
      const err = new Error("Seul un objectif en cours peut être validé");
      err.status = 400;
      throw err;
    }

    const domaine = await tx.domaine.findUnique({ where: { id: objectif.domaineId } });
    const next = gam.applyXpToDomaine(domaine, gained);

    const updatedDomaine = await tx.domaine.update({
      where: { id: domaine.id },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
      },
    });
    const updatedObjectif = await tx.objectif.findUnique({ where: { id } });

    return { objectif: updatedObjectif, domaine: updatedDomaine, next };
  });

  res.json({
    objectif: result.objectif,
    xpEarned: gained,
    leveledUp: result.next.leveledUp,
    newLevels: result.next.newLevels,
    domaine: result.domaine,
  });
}));

// POST /objectifs/:id/taches/generate — génère + persiste le plan de séances (déterministe, zéro LLM)
router.post("/:id/taches/generate", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const objectif = await findObjectif(req.userId, id);
  if (!objectif) return res.status(404).json({ error: "Objectif introuvable" });
  if (objectif.status !== "en_cours") {
    return res.status(400).json({ error: "Impossible de générer un plan pour un objectif terminé" });
  }

  const existing = await prisma.tache.findMany({
    where: { objectifId: id },
    orderBy: { orderIndex: "asc" },
  });
  if (existing.length > 0) {
    return res.json({ taches: existing, reused: true });
  }

  const seances = planGenerator.generatePlan(objectif);

  await prisma.tache.createMany({
    data: seances.map((s) => ({
      title: s.title,
      description: s.description || null,
      orderIndex: s.orderIndex,
      weekIndex: s.weekIndex,
      estDurationMin: s.estDurationMin ?? null,
      templateKey: s.templateKey,
      spec: s.spec,
      targetLabel: s.targetLabel ?? null,
      isAiGenerated: false,
      objectifId: id,
    })),
  });

  const created = await prisma.tache.findMany({
    where: { objectifId: id },
    orderBy: { orderIndex: "asc" },
  });
  res.status(201).json({ taches: created });
}));

// GET /objectifs/:id/taches — liste des tâches
router.get("/:id/taches", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findObjectif(req.userId, id))) {
    return res.status(404).json({ error: "Objectif introuvable" });
  }
  const taches = await prisma.tache.findMany({
    where: { objectifId: id },
    orderBy: { orderIndex: "asc" },
  });
  res.json(taches);
}));

// POST /objectifs/:id/sessions — logger une session → XP calculée SERVEUR
router.post("/:id/sessions", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = SessionIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const objectif = await findObjectif(req.userId, id);
  if (!objectif) return res.status(404).json({ error: "Objectif introuvable" });
  if (objectif.status !== "en_cours") {
    return res.status(400).json({ error: "Impossible de logger une session sur un objectif terminé" });
  }

  const { durationMinutes, difficulty, selfRating, focusPoint, tacheId, perfDistanceKm, perfDurationSec } = parsed.data;

  // Transaction interactive : lecture + calcul + écritures atomiques (pas d'XP perdue en concurrence).
  const result = await prisma.$transaction(async (tx) => {
    // Revérifie le statut DANS la transaction (l'objectif peut avoir été validé entre-temps).
    const stillActive = await tx.objectif.findFirst({ where: { id, status: "en_cours" } });
    if (!stillActive) {
      const err = new Error("Impossible de logger une session sur un objectif terminé");
      err.status = 400;
      throw err;
    }

    // Anti-triche : si la session est liée à une tâche, la difficulté vient du
    // template de la tâche (comme /taches/:id/complete), pas du client.
    let effectiveDifficulty = difficulty;
    if (tacheId) {
      const tache = await tx.tache.findFirst({
        where: { id: tacheId, objectifId: id, objectif: { domaine: { userId: req.userId } } },
      });
      if (!tache) {
        const err = new Error("Tâche liée invalide pour cet objectif");
        err.status = 400;
        throw err;
      }
      effectiveDifficulty = gam.taskDifficulty(tache.templateKey);
    }

    // Le serveur calcule l'XP — le client n'envoie JAMAIS de montant d'XP.
    const xpEarned = gam.sessionXp({
      durationMinutes,
      difficulty: effectiveDifficulty,
      hasFeedback: false,
    });

    const domaine = await tx.domaine.findUnique({ where: { id: objectif.domaineId } });
    const next = gam.applyXpToDomaine(domaine, xpEarned);

    const session = await tx.session.create({
      data: {
        durationMinutes,
        difficulty: effectiveDifficulty,
        selfRating: selfRating ?? null,
        focusPoint: focusPoint ?? null,
        tacheId: tacheId ?? null,
        xpEarned,
        objectifId: id,
        perfDistanceKm: perfDistanceKm ?? null,
        perfDurationSec: perfDurationSec ?? null,
      },
    });
    const updatedDomaine = await tx.domaine.update({
      where: { id: domaine.id },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
        totalMinutes: domaine.totalMinutes + durationMinutes,
      },
    });

    // Prédiction : si une perf réelle est fournie, recalcul déterministe de l'estimation courante,
    // puis recalibrage silencieux des allures des séances restantes (a_faire) sur cette nouvelle estimation.
    let updatedObjectif = null;
    const est = prediction.updateEstimate(objectif, {
      distanceKm: perfDistanceKm,
      durationSec: perfDurationSec,
    });
    if (est) {
      updatedObjectif = await tx.objectif.update({
        where: { id },
        data: { currentValue: est.currentValue, estimateUpdatedAt: new Date() },
      });

      const remaining = await tx.tache.findMany({ where: { objectifId: id, status: "a_faire" } });
      const updates = planGenerator.recalibrate(updatedObjectif, remaining);
      for (const u of updates) {
        await tx.tache.update({
          where: { id: u.id },
          data: { spec: u.spec, targetLabel: u.targetLabel, estDurationMin: u.estDurationMin },
        });
      }
    }

    return {
      session,
      xpEarned,
      leveledUp: next.leveledUp,
      newLevels: next.newLevels,
      domaine: updatedDomaine,
      prediction: est ? prediction.predictionPayload(updatedObjectif) : null,
    };
  });

  res.status(201).json(result);
}));

// GET /objectifs/:id/sessions — historique
router.get("/:id/sessions", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findObjectif(req.userId, id))) {
    return res.status(404).json({ error: "Objectif introuvable" });
  }
  const sessions = await prisma.session.findMany({
    where: { objectifId: id },
    orderBy: { createdAt: "desc" },
    include: { feedback: true },
  });
  res.json(sessions);
}));

module.exports = router;
