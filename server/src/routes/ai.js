// Routes /ai : raffinage d'un objectif libre. Tout en français.
const express = require("express");
const auth = require("../middleware/auth");
const { RefineIn, ObjectiveSuggestIn } = require("../validation/schemas");
const ai = require("../services/ai");
const { findDomaine } = require("../access");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// POST /ai/running/suggestions — compatibilité ancienne UI : objectifs de course.
router.post("/running/suggestions", asyncHandler(async (req, res) => {
  const parsed = ObjectiveSuggestIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const objectifs = await ai.suggestObjectives({
      domaine: { name: "Course à pied", description: "Progression en course à pied" },
      niveau: parsed.data.niveau || "débutant",
      objectiveType: parsed.data.objectiveType || null,
    });
    res.json({ objectifs });
  } catch (e) {
    res.status(502).json({ error: `IA indisponible: ${e.message}` });
  }
}));

// POST /ai/objectifs/refine — transforme un objectif libre en objectif SMART contextualisé.
router.post("/objectifs/refine", asyncHandler(async (req, res) => {
  const parsed = RefineIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  let domaine = parsed.data.domaine || "Progression personnelle";
  if (parsed.data.domaineId) {
    const found = await findDomaine(req.userId, parsed.data.domaineId);
    if (!found) return res.status(404).json({ error: "Domaine introuvable" });
    domaine = found;
  }
  try {
    const refined = await ai.refineObjective({
      domaine,
      objectifBrut: parsed.data.objectifBrut,
      niveau: parsed.data.niveau || "débutant",
      objectiveType: parsed.data.objectiveType || null,
    });
    res.json(refined);
  } catch (e) {
    res.status(502).json({ error: `IA indisponible: ${e.message}` });
  }
}));

module.exports = router;
