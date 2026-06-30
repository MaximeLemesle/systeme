// Routes /taches : modifier / cocher une tâche.
const express = require("express");
const prisma = require("../prisma");
const auth = require("../middleware/auth");
const { findTache } = require("../access");
const { TacheUpdateIn } = require("../validation/schemas");

const router = express.Router();
router.use(auth);

// PATCH /taches/:id — modifier (ex : status "fait")
router.patch("/:id", async (req, res) => {
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
});

module.exports = router;
