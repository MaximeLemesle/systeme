// Routes /domaines : CRUD, progression et création d'objectif.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findDomaine } = require("../access");
const { DomaineIn, ObjectifIn, ObjectiveSuggestIn } = require("../validation/schemas");
const ai = require("../services/ai");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
const MAX_DOMAINES_PER_USER = 3;
router.use(auth); // toutes les routes domaines exigent un token

// GET /domaines — liste des domaines du user
router.get("/", asyncHandler(async (req, res) => {
  const domaines = await prisma.domaine.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    include: {
      objectifs: {
        select: { id: true, title: true, status: true, difficulty: true, deadline: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });
  res.json(domaines);
}));

// POST /domaines — créer un domaine
router.post("/", asyncHandler(async (req, res) => {
  const parsed = DomaineIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  // Comptage + création dans la même transaction : la limite ne peut pas être
  // contournée par deux requêtes simultanées.
  const domaine = await prisma.$transaction(async (tx) => {
    const count = await tx.domaine.count({ where: { userId: req.userId } });
    if (count >= MAX_DOMAINES_PER_USER) {
      const err = new Error("Tu peux suivre 3 domaines maximum.");
      err.status = 400;
      throw err;
    }
    return tx.domaine.create({ data: { ...parsed.data, userId: req.userId } });
  });
  res.status(201).json(domaine);
}));

// GET /domaines/:id/progression — domaine + objectifs + objectif actif détaillé
router.get("/:id/progression", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const domaine = await findDomaine(req.userId, id);
  if (!domaine) return res.status(404).json({ error: "Domaine introuvable" });

  const objectifs = await prisma.objectif.findMany({
    where: { domaineId: id },
    orderBy: { createdAt: "desc" },
  });

  const objectifActif = await prisma.objectif.findFirst({
    where: { domaineId: id, status: "en_cours" },
    orderBy: { createdAt: "desc" },
    include: {
      taches: { orderBy: { orderIndex: "asc" } },
      sessions: { orderBy: { createdAt: "desc" }, include: { feedback: true } },
    },
  });

  res.json({ domaine, objectifs, objectifActif });
}));

// GET /domaines/:id — détail + objectifs
router.get("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const domaine = await prisma.domaine.findFirst({
    where: { id, userId: req.userId },
    include: { objectifs: { orderBy: { createdAt: "desc" } } },
  });
  if (!domaine) return res.status(404).json({ error: "Domaine introuvable" });
  res.json(domaine);
}));

// PUT /domaines/:id — modifier
router.put("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = DomaineIn.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (!(await findDomaine(req.userId, id))) {
    return res.status(404).json({ error: "Domaine introuvable" });
  }
  const domaine = await prisma.domaine.update({ where: { id }, data: parsed.data });
  res.json(domaine);
}));

// DELETE /domaines/:id — supprimer (cascade objectifs/tâches/sessions)
router.delete("/:id", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findDomaine(req.userId, id))) {
    return res.status(404).json({ error: "Domaine introuvable" });
  }
  await prisma.domaine.delete({ where: { id } });
  res.json({ ok: true });
}));

// POST /domaines/:id/objectifs/suggestions — IA : objectifs SMART proposés pour ce domaine
router.post("/:id/objectifs/suggestions", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = ObjectiveSuggestIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const domaine = await findDomaine(req.userId, id);
  if (!domaine) return res.status(404).json({ error: "Domaine introuvable" });

  try {
    const objectifs = await ai.suggestObjectives({
      domaine,
      niveau: parsed.data.niveau || "débutant",
      objectiveType: parsed.data.objectiveType || null,
    });
    res.json({ objectifs });
  } catch (e) {
    res.status(502).json({ error: `IA indisponible: ${e.message}` });
  }
}));

// POST /domaines/:id/objectifs — créer un objectif
router.post("/:id/objectifs", asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = ObjectifIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  if (!(await findDomaine(req.userId, id))) {
    return res.status(404).json({ error: "Domaine introuvable" });
  }
  const { deadline, ...rest } = parsed.data;
  const objectif = await prisma.objectif.create({
    data: {
      ...rest,
      deadline: deadline ? new Date(deadline) : null,
      domaineId: id,
    },
  });
  res.status(201).json(objectif);
}));

module.exports = router;
