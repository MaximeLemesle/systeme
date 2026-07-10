// Routes /ai : intake conversationnel (course à pied uniquement). Tout en français.
const express = require("express");
const auth = require("../middleware/auth");
const { IntakeIn } = require("../validation/schemas");
const ai = require("../services/ai");
const asyncHandler = require("../middleware/asyncHandler");

const router = express.Router();
router.use(auth);

// POST /ai/objectifs/intake — recueil conversationnel (multi-tours) → question suivante OU objectif SMART final.
router.post("/objectifs/intake", asyncHandler(async (req, res) => {
  const parsed = IntakeIn.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  try {
    const out = await ai.intakeConversation({
      niveau: parsed.data.niveau || "débutant",
      messages: parsed.data.messages,
    });
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: `IA indisponible: ${e.message}` });
  }
}));

module.exports = router;
