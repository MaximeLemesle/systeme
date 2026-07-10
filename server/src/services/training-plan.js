const SESSION_CATALOG = Object.freeze({
  footing: {
    label: "Footing facile",
    intensity: [65, 75],
    difficulty: "facile",
    durationFactor: 1,
    advice: "Reste en aisance respiratoire.",
  },
  recuperation: {
    label: "Récupération",
    intensity: [55, 65],
    difficulty: "facile",
    durationFactor: 0.75,
    advice: "Garde une foulée relâchée.",
  },
  fractionne_court: {
    label: "Fractionné court",
    intensity: [100, 110],
    difficulty: "difficile",
    durationFactor: 0.85,
    advice: "Récupère en trottinant entre les répétitions.",
  },
  fractionne_long: {
    label: "Fractionné long",
    intensity: [90, 100],
    difficulty: "difficile",
    durationFactor: 1,
    advice: "Conserve la même allure sur chaque répétition.",
  },
  tempo: {
    label: "Tempo",
    intensity: [80, 88],
    difficulty: "moyen",
    durationFactor: 1,
    advice: "Maintiens une allure soutenue mais contrôlée.",
  },
  seuil: {
    label: "Travail au seuil",
    intensity: [88, 92],
    difficulty: "difficile",
    durationFactor: 1,
    advice: "Découpe l'effort si l'allure se dégrade.",
  },
  sortie_longue: {
    label: "Sortie longue",
    intensity: [65, 75],
    difficulty: "moyen",
    durationFactor: 1.55,
    advice: "Pars lentement et hydrate-toi régulièrement.",
  },
  allure_objectif: {
    label: "Allure objectif",
    intensity: [75, 90],
    difficulty: "difficile",
    durationFactor: 1.1,
    advice: "Reproduis les conditions de ton objectif sans sprinter.",
  },
});

const HARD_SESSION_ROTATION = ["fractionne_court", "tempo", "fractionne_long", "seuil"];
const BASE_DURATION = { "débutant": 30, "intermédiaire": 40, "avancé": 45 };
const LEGACY_DIFFICULTY = { fractionne: "difficile", objectif: "difficile", general: "moyen" };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function difficultyForCategory(category) {
  return SESSION_CATALOG[category]?.difficulty || LEGACY_DIFFICULTY[category] || "moyen";
}

function categoryForSession(week, slot, frequency, isLast) {
  if (isLast) return "allure_objectif";
  if (slot === 0) return week % 4 === 0 ? "recuperation" : "footing";
  if (slot === frequency - 1) return "sortie_longue";
  if (slot === 1) return HARD_SESSION_ROTATION[(week - 1) % HARD_SESSION_ROTATION.length];
  return slot % 2 === 0 ? "recuperation" : "footing";
}

function generateTrainingPlan({
  weeks,
  frequency,
  niveau = "débutant",
  vmaKmh = null,
}) {
  const planWeeks = clamp(Math.round(weeks || 8), 5, 20);
  const weeklyFrequency = clamp(Math.round(frequency || 3), 2, 5);
  const normalizedLevel = niveau.toLowerCase();
  const baseDuration = normalizedLevel.includes("intermédiaire")
    ? BASE_DURATION["intermédiaire"]
    : normalizedLevel.includes("avancé")
      ? BASE_DURATION["avancé"]
      : BASE_DURATION["débutant"];
  const totalSessions = planWeeks * weeklyFrequency;
  const sessions = [];

  for (let week = 1; week <= planWeeks; week += 1) {
    const recoveryFactor = week % 4 === 0 ? 0.85 : 1;
    const progressionFactor = 1 + (week - 1) * 0.035;

    for (let slot = 0; slot < weeklyFrequency; slot += 1) {
      const orderIndex = sessions.length + 1;
      const category = categoryForSession(
        week,
        slot,
        weeklyFrequency,
        orderIndex === totalSessions
      );
      const template = SESSION_CATALOG[category];
      const intensityProgress = (week - 1) / Math.max(1, planWeeks - 1);
      const intensityPercent = Math.round(
        template.intensity[0] + (template.intensity[1] - template.intensity[0]) * intensityProgress
      );
      const estDurationMin = clamp(
        Math.round(baseDuration * template.durationFactor * progressionFactor * recoveryFactor),
        20,
        180
      );
      const distanceKm = vmaKmh
        ? roundOne(Number(vmaKmh) * (intensityPercent / 100) * (estDurationMin / 60))
        : null;

      sessions.push({
        title: `Semaine ${week} - ${template.label}`,
        description: `${estDurationMin} min à ${intensityPercent} % de VMA. ${template.advice}`,
        orderIndex,
        weekIndex: week,
        estDurationMin,
        intensityPercent,
        distanceKm,
        category,
        isAiGenerated: false,
      });
    }
  }

  return sessions;
}

function predictTimeSeconds({ distanceKm, timeSeconds, targetDistanceKm }) {
  const distance = Number(distanceKm);
  const target = Number(targetDistanceKm);
  if (!(distance > 0) || !(timeSeconds > 0) || !(target > 0)) return null;
  return Math.round(timeSeconds * Math.pow(target / distance, 1.06));
}

function targetDistanceForObjective(objectif) {
  if (objectif.targetDistanceKm != null) return Number(objectif.targetDistanceKm);
  return objectif.unit?.toLowerCase() === "km" ? Number(objectif.targetValue) : null;
}

function adaptationForPerformance({ selfRating, predictionSeconds, targetTimeSeconds }) {
  if (selfRating != null && selfRating <= 2) {
    return { durationFactor: 0.9, intensityDelta: -5 };
  }
  if (
    predictionSeconds &&
    targetTimeSeconds &&
    predictionSeconds > targetTimeSeconds * 1.1
  ) {
    return { durationFactor: 0.95, intensityDelta: -2 };
  }
  if (selfRating != null && selfRating >= 4) {
    return { durationFactor: 1.03, intensityDelta: 2 };
  }
  return { durationFactor: 1, intensityDelta: 0 };
}

function recalibrateRemainingTasks(tasks, performance) {
  const adjustment = adaptationForPerformance(performance);
  if (adjustment.durationFactor === 1 && adjustment.intensityDelta === 0) return [];

  return tasks.map((task) => {
    const template = SESSION_CATALOG[task.category];
    const duration = clamp(
      Math.round((task.estDurationMin || 30) * adjustment.durationFactor),
      20,
      180
    );
    const currentIntensity = task.intensityPercent || template?.intensity[0] || 70;
    const intensityPercent = template
      ? clamp(
          currentIntensity + adjustment.intensityDelta,
          template.intensity[0],
          template.intensity[1]
        )
      : currentIntensity;
    const distanceKm = performance.vmaKmh
      ? roundOne(Number(performance.vmaKmh) * (intensityPercent / 100) * (duration / 60))
      : task.distanceKm == null ? null : Number(task.distanceKm);

    return {
      id: task.id,
      data: { estDurationMin: duration, intensityPercent, distanceKm },
    };
  });
}

module.exports = {
  SESSION_CATALOG,
  difficultyForCategory,
  generateTrainingPlan,
  predictTimeSeconds,
  recalibrateRemainingTasks,
  targetDistanceForObjective,
};
