const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SESSION_CATALOG,
  generateTrainingPlan,
  predictTimeSeconds,
  recalibrateRemainingTasks,
} = require("../src/services/training-plan");

test("le catalogue contient exactement les huit types de séance attendus", () => {
  assert.deepEqual(Object.keys(SESSION_CATALOG).sort(), [
    "allure_objectif",
    "footing",
    "fractionne_court",
    "fractionne_long",
    "recuperation",
    "seuil",
    "sortie_longue",
    "tempo",
  ]);
});

test("generateTrainingPlan respecte les bornes de 5 à 20 semaines", () => {
  const shortPlan = generateTrainingPlan({ weeks: 1, frequency: 2, niveau: "débutant" });
  const longPlan = generateTrainingPlan({ weeks: 30, frequency: 5, niveau: "avancé" });

  assert.equal(shortPlan.length, 10);
  assert.equal(shortPlan.at(-1).weekIndex, 5);
  assert.equal(longPlan.length, 100);
  assert.equal(longPlan.at(-1).weekIndex, 20);
  assert.ok([...shortPlan, ...longPlan].every((task) => SESSION_CATALOG[task.category]));
});

test("la formule de Riegel projette un 5 km en 25 min vers 10 km", () => {
  assert.equal(
    predictTimeSeconds({ distanceKm: 5, timeSeconds: 1500, targetDistanceKm: 10 }),
    3127
  );
});

test("un ressenti difficile allège les séances restantes sans changer leur type", () => {
  const [task] = generateTrainingPlan({ weeks: 5, frequency: 2, niveau: "intermédiaire", vmaKmh: 14 });
  const [adjusted] = recalibrateRemainingTasks(
    [{ ...task, id: 42 }],
    { selfRating: 1, predictionSeconds: 1600, targetTimeSeconds: 1500, vmaKmh: 14 }
  );

  assert.equal(adjusted.id, 42);
  assert.ok(adjusted.data.estDurationMin < task.estDurationMin);
  assert.ok(adjusted.data.distanceKm < task.distanceKm);
});
