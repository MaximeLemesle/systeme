const express = require("express");
const auth = require("../middleware/auth");
const { IntakeIn } = require("../validation/schemas");
const ai = require("../services/ai");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// POST /ai/objectifs/intake — une question à la fois jusqu'à obtenir l'objectif SMART.
router.post("/objectifs/intake", asyncHandler(async (req, res) => {
  const parsed = IntakeIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const questionsAsked = parsed.data.messages.filter((message) => message.role === "assistant").length;

  try {
    const result = await ai.intakeObjective({
      messages: parsed.data.messages,
      niveau: parsed.data.niveau || "débutant",
    });
    res.json({ ...result, questionsAsked });
  } catch (error) {
    res.status(502).json({ error: `IA indisponible: ${error.message}` });
  }
}));

module.exports = router;
