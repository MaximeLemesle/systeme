// Routes /domaines : mono-domaine (course à pied, auto-créé à l'inscription).
// Plus de CRUD de domaine exposé — seule la progression et la création d'objectif restent.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findDomaine } = require("../access");
const { ObjectifIn } = require("../validation/schemas");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// GET /domaines — le domaine unique du user (avec ses derniers objectifs)
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

// POST /domaines/:id/objectifs — créer un objectif de course
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
