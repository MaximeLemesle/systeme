// Routes /domaines : consultation du domaine running et création d'objectif.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findDomaine } = require("../access");
const { ObjectifIn } = require("../validation/schemas");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
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
  const objectif = await prisma.$transaction(async (tx) => {
    const activeCount = await tx.objectif.count({
      where: { domaineId: id, status: "en_cours" },
    });
    if (activeCount > 0) {
      const error = new Error("Termine ou abandonne l'objectif en cours avant d'en créer un autre");
      error.status = 409;
      throw error;
    }
    return tx.objectif.create({
      data: {
        ...rest,
        deadline: deadline ? new Date(deadline) : null,
        domaineId: id,
      },
    });
  });
  res.status(201).json(objectif);
}));

module.exports = router;
