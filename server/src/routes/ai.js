const express = require("express");
const auth = require("../middleware/auth");
const { IntakeIn } = require("../validation/schemas");
const ai = require("../services/ai");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// POST /ai/objectifs/intake — au plus quatre questions avant l'objectif SMART.
router.post("/objectifs/intake", asyncHandler(async (req, res) => {
  const parsed = IntakeIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const questionsAsked = parsed.data.messages.filter((message) => message.role === "assistant").length;
  if (questionsAsked > 4) {
    return res.status(400).json({ error: "L'intake est limité à quatre questions" });
  }

  try {
    const result = await ai.intakeObjective({
      messages: parsed.data.messages,
      niveau: parsed.data.niveau || "débutant",
      mustComplete: questionsAsked >= 4,
    });
    res.json({ ...result, questionsAsked });
  } catch (error) {
    res.status(502).json({ error: `IA indisponible: ${error.message}` });
  }
}));

module.exports = router;
