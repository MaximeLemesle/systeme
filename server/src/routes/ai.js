// Routes /ai : suggestions d'objectifs de course + raffinage d'un objectif libre. Tout en français.
const express = require("express");
const auth = require("../middleware/auth");
const { RefineIn, RunningSuggestIn } = require("../validation/schemas");
const ai = require("../services/ai");

const router = express.Router();
router.use(auth);

// POST /ai/running/suggestions — propose 3 objectifs SMART selon niveau + type visé.
router.post("/running/suggestions", async (req, res) => {
  const parsed = RunningSuggestIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const objectifs = await ai.suggestRunningObjectives({
      niveau: parsed.data.niveau || "débutant",
      objectiveType: parsed.data.objectiveType || "endurance",
    });
    res.json({ objectifs });
  } catch (e) {
    res.status(502).json({ error: `IA indisponible: ${e.message}` });
  }
});

// POST /ai/objectifs/refine — transforme un objectif libre en objectif SMART de course.
router.post("/objectifs/refine", async (req, res) => {
  const parsed = RefineIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const refined = await ai.refineObjective({
      objectifBrut: parsed.data.objectifBrut,
      niveau: parsed.data.niveau || "débutant",
      objectiveType: parsed.data.objectiveType || "endurance",
    });
    res.json(refined);
  } catch (e) {
    res.status(502).json({ error: `IA indisponible: ${e.message}` });
  }
});

module.exports = router;
