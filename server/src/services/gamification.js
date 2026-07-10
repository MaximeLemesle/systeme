// Logique de gamification — TOUT se calcule côté serveur (anti-triche).
// totalXp = XP accumulée DANS le niveau courant (pour afficher "1240 / 1800").

const XP_PER_MIN = 2;
const DIFFICULTY_MULT = { facile: 1.0, moyen: 1.25, difficile: 1.5 };
const VALIDATION_XP = { facile: 500, moyen: 1000, difficile: 2000 };
const { difficultyForCategory } = require("./training-plan");

// XP d'une session
function sessionXp({ durationMinutes, difficulty, hasFeedback }) {
  const dm = DIFFICULTY_MULT[difficulty] ?? 1;
  const fb = hasFeedback ? 1.5 : 1;
  return Math.round(durationMinutes * XP_PER_MIN * dm * fb);
}

// XP de validation d'un objectif
function validationXp(difficulty) {
  return VALIDATION_XP[difficulty] ?? VALIDATION_XP.moyen;
}

function taskDifficulty(category) {
  return difficultyForCategory(category);
}

// Seuil du niveau courant
function xpToNextLevel(level) {
  return Math.round(100 * Math.pow(level, 1.6));
}

// Applique un gain d'XP à un domaine, gère les montées de niveau multiples.
// Retourne le nouvel état à persister + info de level up.
function applyXpToDomaine(domaine, gainedXp) {
  let level = domaine.level;
  let xp = domaine.totalXp + gainedXp;
  let threshold = xpToNextLevel(level);
  const newLevels = [];
  while (xp >= threshold) {
    xp -= threshold;
    level += 1;
    newLevels.push(level);
    threshold = xpToNextLevel(level);
  }
  return {
    level,
    totalXp: xp,
    xpToNextLevel: threshold,
    leveledUp: newLevels.length > 0,
    newLevels,
  };
}

// % vers la maîtrise (10 000 h = 600 000 min)
function masteryPercent(totalMinutes) {
  return (totalMinutes / 600000) * 100;
}

module.exports = {
  sessionXp,
  validationXp,
  taskDifficulty,
  xpToNextLevel,
  applyXpToDomaine,
  masteryPercent,
};
