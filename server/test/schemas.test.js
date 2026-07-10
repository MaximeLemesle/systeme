const test = require("node:test");
const assert = require("node:assert/strict");
const { ObjectifIn, IntakeOut, SessionIn } = require("../src/validation/schemas");

test("ObjectifIn exige une distance de référence (mono-course)", () => {
  assert.throws(() =>
    ObjectifIn.parse({
      title: "Courir 5 km sans pause",
      metricLabel: "distance",
      targetValue: 5,
    })
  );

  const parsed = ObjectifIn.parse({
    title: "Courir 5 km sans pause",
    metricLabel: "distance",
    targetValue: 5,
    targetDistanceKm: 5,
  });
  assert.equal(parsed.archetype, "completion"); // défaut
  assert.equal(parsed.frequency, 3); // défaut
});

test("ObjectifIn accepte l'archétype chrono explicite", () => {
  const parsed = ObjectifIn.parse({
    title: "Descendre sous les 24 min au 5 km",
    metricLabel: "temps",
    targetValue: 1440,
    targetDistanceKm: 5,
    archetype: "chrono",
    frequency: 4,
  });
  assert.equal(parsed.archetype, "chrono");
  assert.equal(parsed.frequency, 4);
});

test("IntakeOut : sortie finale requiert un objectif complet, coercition des nombres du LLM", () => {
  const parsed = IntakeOut.parse({
    done: true,
    assistant: "C'est parti !",
    objectif: {
      title: "Courir mon premier 10 km",
      metric_label: "distance",
      unit: "km",
      start_value: null,
      target_value: "10", // le LLM renvoie parfois une chaîne
      target_distance_km: "10",
      difficulty: "moyen",
      deadline: "2026-09-01",
      archetype: "completion",
      frequency: "3",
      faisabilite: "Réaliste avec un plan progressif.",
    },
  });
  assert.equal(parsed.objectif.target_value, 10);
  assert.equal(parsed.objectif.frequency, 3);

  assert.throws(() => IntakeOut.parse({ done: true, assistant: "..." }));
});

test("SessionIn : perf distance + temps optionnelles, plus de champ perfValue générique", () => {
  const parsed = SessionIn.parse({
    durationMinutes: 40,
    difficulty: "moyen",
    perfDistanceKm: 5,
    perfDurationSec: 1500,
  });
  assert.equal(parsed.perfDistanceKm, 5);
  assert.equal("perfValue" in parsed, false);
});
