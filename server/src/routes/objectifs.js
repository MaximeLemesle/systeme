// Routes /objectifs : détail, modification, cycle de vie, plan et sessions.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findObjectif } = require("../access");
const { ObjectifUpdateIn, SessionIn } = require("../validation/schemas");
const gam = require("../services/gamification");
const training = require("../services/training-plan");
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

// PATCH /objectifs/:id/abandon — abandon explicite, sans gain d'XP.
router.patch("/:id/abandon", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const objectif = await findObjectif(req.userId, id);
  if (!objectif) return res.status(404).json({ error: "Objectif introuvable" });
  if (objectif.status !== "en_cours") {
    return res.status(400).json({ error: "Seul un objectif en cours peut être abandonné" });
  }
  const abandoned = await prisma.objectif.update({
    where: { id },
    data: { status: "abandonne" },
  });
  res.json(abandoned);
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
    const taskCount = await tx.tache.count({ where: { objectifId: id } });
    const remainingCount = await tx.tache.count({
      where: { objectifId: id, status: { not: "fait" } },
    });
    if (taskCount === 0 || remainingCount > 0) {
      const err = new Error("Toutes les séances du plan doivent être terminées");
      err.status = 400;
      throw err;
    }

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

// POST /objectifs/:id/taches/generate — génère le plan déterministe et le persiste.
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

  const seances = training.generateTrainingPlan({
    weeks: objectif.planWeeks,
    frequency: objectif.trainingFrequency,
    niveau: objectif.niveau || "débutant",
    vmaKmh: objectif.vmaKmh == null ? null : Number(objectif.vmaKmh),
  });

  await prisma.tache.createMany({
    data: seances.map((s) => ({
      ...s,
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

  const {
    durationMinutes,
    selfRating,
    focusPoint,
    distanceKm,
    timeSeconds,
  } = parsed.data;

  // Transaction interactive : lecture + calcul + écritures atomiques (pas d'XP perdue en concurrence).
  const result = await prisma.$transaction(async (tx) => {
    // Revérifie le statut DANS la transaction (l'objectif peut avoir été validé entre-temps).
    const stillActive = await tx.objectif.findFirst({
      where: { id, status: "en_cours" },
      include: { domaine: true },
    });
    if (!stillActive) {
      const err = new Error("Impossible de logger une session sur un objectif terminé");
      err.status = 400;
      throw err;
    }

    // Une sortie libre a une difficulté fixe : ni la difficulté ni l'XP ne viennent du client.
    const effectiveDifficulty = "moyen";
    const xpEarned = gam.sessionXp({
      durationMinutes,
      difficulty: effectiveDifficulty,
      hasFeedback: false,
    });

    const predictionSeconds = training.predictTimeSeconds({
      distanceKm,
      timeSeconds,
      targetDistanceKm: training.targetDistanceForObjective(stillActive),
    });
    const remainingTasks = await tx.tache.findMany({
      where: {
        objectifId: id,
        status: "a_faire",
      },
    });
    const taskUpdates = training.recalibrateRemainingTasks(remainingTasks, {
      selfRating,
      predictionSeconds,
      targetTimeSeconds: stillActive.targetTimeSeconds,
      vmaKmh: stillActive.vmaKmh,
    });
    const next = gam.applyXpToDomaine(stillActive.domaine, xpEarned);

    const session = await tx.session.create({
      data: {
        durationMinutes,
        distanceKm: distanceKm ?? null,
        timeSeconds: timeSeconds ?? null,
        difficulty: effectiveDifficulty,
        selfRating: selfRating ?? null,
        focusPoint: focusPoint ?? null,
        xpEarned,
        objectifId: id,
      },
    });
    if (predictionSeconds != null) {
      await tx.objectif.update({ where: { id }, data: { predictionSeconds } });
    }
    for (const update of taskUpdates) {
      await tx.tache.update({ where: { id: update.id }, data: update.data });
    }
    const updatedDomaine = await tx.domaine.update({
      where: { id: stillActive.domaine.id },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
        totalMinutes: stillActive.domaine.totalMinutes + durationMinutes,
      },
    });

    return {
      session,
      xpEarned,
      predictionSeconds,
      adjustedTasks: taskUpdates.length,
      leveledUp: next.leveledUp,
      newLevels: next.newLevels,
      domaine: updatedDomaine,
    };
  });

  res.status(201).json(result);
}));

// GET /objectifs/:id/sessions?page=1&limit=10 — historique paginé.
// Pagination + select minimal : la réponse ne grossit plus avec le nombre de sessions.
router.get("/:id/sessions", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findObjectif(req.userId, id))) {
    return res.status(404).json({ error: "Objectif introuvable" });
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    prisma.session.count({ where: { objectifId: id } }),
    prisma.session.findMany({
      where: { objectifId: id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      // On ne renvoie que les champs affichés, pas la relation complète.
      select: {
        id: true,
        durationMinutes: true,
        distanceKm: true,
        timeSeconds: true,
        difficulty: true,
        selfRating: true,
        xpEarned: true,
        createdAt: true,
        tacheId: true,
        feedback: { select: { id: true, notes: true, correction: true } },
      },
    }),
  ]);

  res.json({
    data,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}));

module.exports = router;
