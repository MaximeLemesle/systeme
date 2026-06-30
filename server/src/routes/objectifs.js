// Routes /objectifs : détail, modif, validation, génération IA des tâches, sessions.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findObjectif } = require("../access");
const { ObjectifUpdateIn, SessionIn } = require("../validation/schemas");
const ai = require("../services/ai");
const gam = require("../services/gamification");

const router = express.Router();
router.use(auth);

// GET /objectifs/:id — détail + tâches + sessions
router.get("/:id", async (req, res) => {
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
});

// PUT /objectifs/:id — modifier (ex : currentValue)
router.put("/:id", async (req, res) => {
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
});

// DELETE /objectifs/:id — supprimer
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findObjectif(req.userId, id))) {
    return res.status(404).json({ error: "Objectif introuvable" });
  }
  await prisma.objectif.delete({ where: { id } });
  res.json({ ok: true });
});

// PATCH /objectifs/:id/validate — valider → gros gain d'XP au domaine
router.patch("/:id/validate", async (req, res) => {
  const id = Number(req.params.id);
  const objectif = await findObjectif(req.userId, id);
  if (!objectif) return res.status(404).json({ error: "Objectif introuvable" });
  if (objectif.status === "valide") {
    return res.status(400).json({ error: "Objectif déjà validé" });
  }

  const gained = gam.validationXp(objectif.difficulty);
  const domaine = await prisma.domaine.findUnique({ where: { id: objectif.domaineId } });
  const next = gam.applyXpToDomaine(domaine, gained);

  const [updatedObjectif, updatedDomaine] = await prisma.$transaction([
    prisma.objectif.update({
      where: { id },
      data: { status: "valide", validatedAt: new Date() },
    }),
    prisma.domaine.update({
      where: { id: domaine.id },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
      },
    }),
  ]);

  res.json({
    objectif: updatedObjectif,
    xpEarned: gained,
    leveledUp: next.leveledUp,
    newLevels: next.newLevels,
    domaine: updatedDomaine,
  });
});

// POST /objectifs/:id/taches/generate — IA : génère + persiste le plan de tâches
router.post("/:id/taches/generate", async (req, res) => {
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

  let seances;
  try {
    seances = await ai.generateTrainingPlan({
      objectif: {
        title: objectif.title,
        metric_label: objectif.metricLabel,
        target_value: Number(objectif.targetValue),
        difficulty: objectif.difficulty,
        objective_type: objectif.objectiveType,
      },
      niveau: objectif.niveau || "débutant",
    });
  } catch (e) {
    return res.status(502).json({ error: `IA indisponible: ${e.message}` });
  }

  await prisma.tache.createMany({
    data: seances.map((s) => ({
      title: s.title,
      description: s.description || null,
      orderIndex: s.order_index,
      estDurationMin: s.est_duration_min ?? null,
      category: s.category || null,
      isAiGenerated: true,
      objectifId: id,
    })),
  });

  const created = await prisma.tache.findMany({
    where: { objectifId: id },
    orderBy: { orderIndex: "asc" },
  });
  res.status(201).json({ taches: created });
});

// GET /objectifs/:id/taches — liste des tâches
router.get("/:id/taches", async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findObjectif(req.userId, id))) {
    return res.status(404).json({ error: "Objectif introuvable" });
  }
  const taches = await prisma.tache.findMany({
    where: { objectifId: id },
    orderBy: { orderIndex: "asc" },
  });
  res.json(taches);
});

// POST /objectifs/:id/sessions — logger une session → XP calculée SERVEUR
router.post("/:id/sessions", async (req, res) => {
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

  const { durationMinutes, difficulty, selfRating, focusPoint, tacheId } = parsed.data;
  if (tacheId) {
    const tache = await prisma.tache.findFirst({
      where: { id: tacheId, objectifId: id, objectif: { domaine: { userId: req.userId } } },
    });
    if (!tache) {
      return res.status(400).json({ error: "Tâche liée invalide pour cet objectif" });
    }
  }

  // Le serveur calcule l'XP — le client n'envoie JAMAIS de montant d'XP.
  const xpEarned = gam.sessionXp({ durationMinutes, difficulty, hasFeedback: false });

  const domaine = await prisma.domaine.findUnique({ where: { id: objectif.domaineId } });
  const next = gam.applyXpToDomaine(domaine, xpEarned);

  const [session, updatedDomaine] = await prisma.$transaction([
    prisma.session.create({
      data: {
        durationMinutes,
        difficulty,
        selfRating: selfRating ?? null,
        focusPoint: focusPoint ?? null,
        tacheId: tacheId ?? null,
        xpEarned,
        objectifId: id,
      },
    }),
    prisma.domaine.update({
      where: { id: domaine.id },
      data: {
        level: next.level,
        totalXp: next.totalXp,
        xpToNextLevel: next.xpToNextLevel,
        totalMinutes: domaine.totalMinutes + durationMinutes,
      },
    }),
  ]);

  res.status(201).json({
    session,
    xpEarned,
    leveledUp: next.leveledUp,
    newLevels: next.newLevels,
    domaine: updatedDomaine,
  });
});

// GET /objectifs/:id/sessions — historique
router.get("/:id/sessions", async (req, res) => {
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
});

module.exports = router;
