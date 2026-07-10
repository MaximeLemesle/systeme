const test = require("node:test");
const assert = require("node:assert/strict");
const gamification = require("../src/services/gamification");

test("sessionXp applique durée, difficulté et bonus feedback", () => {
  assert.equal(
    gamification.sessionXp({ durationMinutes: 40, difficulty: "moyen", hasFeedback: false }),
    100
  );
  assert.equal(
    gamification.sessionXp({ durationMinutes: 40, difficulty: "moyen", hasFeedback: true }),
    150
  );
});

test("applyXpToDomaine gère les montées de niveau multiples", () => {
  const result = gamification.applyXpToDomaine(
    { level: 1, totalXp: 90, xpToNextLevel: 100 },
    500
  );

  assert.equal(result.level > 1, true);
  assert.equal(result.leveledUp, true);
  assert.equal(result.newLevels.length > 0, true);
  assert.equal(result.xpToNextLevel, gamification.xpToNextLevel(result.level));
});

test("taskDifficulty dérive du template de séance (catalogue mono-course)", () => {
  assert.equal(gamification.taskDifficulty("vo2_court"), "difficile");
  assert.equal(gamification.taskDifficulty("seuil"), "difficile");
  assert.equal(gamification.taskDifficulty("ef"), "facile");
  assert.equal(gamification.taskDifficulty("marche_course"), "facile");
  assert.equal(gamification.taskDifficulty("sortie_longue"), "moyen");
  assert.equal(gamification.taskDifficulty("inconnue"), "moyen");
});
