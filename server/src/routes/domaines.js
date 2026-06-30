// Routes /domaines : CRUD + création d'objectif. (Les suggestions IA sont sous /ai.)
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findDomaine } = require("../access");
const { DomaineIn, ObjectifIn } = require("../validation/schemas");

const router = express.Router();
router.use(auth); // toutes les routes domaines exigent un token

// GET /domaines — liste des domaines du user
router.get("/", async (req, res) => {
  const domaines = await prisma.domaine.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
  });
  res.json(domaines);
});

// POST /domaines — créer un domaine
router.post("/", async (req, res) => {
  const parsed = DomaineIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const domaine = await prisma.domaine.create({
    data: { ...parsed.data, userId: req.userId },
  });
  res.status(201).json(domaine);
});

// GET /domaines/:id — détail + objectifs
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const domaine = await prisma.domaine.findFirst({
    where: { id, userId: req.userId },
    include: { objectifs: { orderBy: { createdAt: "desc" } } },
  });
  if (!domaine) return res.status(404).json({ error: "Domaine introuvable" });
  res.json(domaine);
});

// PUT /domaines/:id — modifier
router.put("/:id", async (req, res) => {
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
});

// DELETE /domaines/:id — supprimer (cascade objectifs/tâches/sessions)
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!(await findDomaine(req.userId, id))) {
    return res.status(404).json({ error: "Domaine introuvable" });
  }
  await prisma.domaine.delete({ where: { id } });
  res.json({ ok: true });
});

// POST /domaines/:id/objectifs — créer un objectif
router.post("/:id/objectifs", async (req, res) => {
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
});

module.exports = router;
