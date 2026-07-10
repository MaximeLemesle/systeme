const test = require("node:test");
const assert = require("node:assert/strict");
const { IntakeOut, ObjectifIn, CompleteTacheIn } = require("../src/validation/schemas");
const { intakeObjective } = require("../src/services/ai");

test("IntakeOut accepte un objectif running complet avec nombres textuels", () => {
  const parsed = IntakeOut.parse({
    complete: true,
    question: null,
    objectif: {
      title: "Courir 10 km en moins de 50 minutes",
      metricLabel: "distance",
      unit: "km",
      targetValue: "10",
      difficulty: "moyen",
      niveau: "intermédiaire",
      objectiveType: "chrono",
      deadline: "2026-10-01",
      trainingFrequency: "3",
      planWeeks: "10",
      vmaKmh: null,
      targetDistanceKm: "10",
      targetTimeSeconds: "3000",
    },
  });
  assert.equal(parsed.objectif.targetTimeSeconds, 3000);
  assert.equal(parsed.objectif.planWeeks, 10);
});

test("IntakeOut refuse un résultat incomplet sans question", () => {
  assert.throws(() => IntakeOut.parse({ complete: false, question: null, objectif: null }));
});

test("ObjectifIn borne fréquence et durée du plan", () => {
  const base = { title: "Courir 5 km", metricLabel: "distance", targetValue: 5 };
  assert.equal(ObjectifIn.safeParse({ ...base, trainingFrequency: 1 }).success, false);
  assert.equal(ObjectifIn.safeParse({ ...base, planWeeks: 21 }).success, false);
  assert.equal(ObjectifIn.safeParse({ ...base, trainingFrequency: 3, planWeeks: 8 }).success, true);
});

test("CompleteTacheIn exige distance et temps ensemble", () => {
  assert.equal(CompleteTacheIn.safeParse({ distanceKm: 5 }).success, false);
  assert.equal(CompleteTacheIn.safeParse({ timeSeconds: 1500 }).success, false);
  assert.equal(CompleteTacheIn.safeParse({ distanceKm: 5, timeSeconds: 1500 }).success, true);
});

test("l'intake accepte une enveloppe omise par Ollama", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            title: "Courir 10 km",
            metricLabel: "distance",
            unit: "km",
            targetValue: 10,
            difficulty: "moyen",
            niveau: "intermédiaire",
            objectiveType: "distance",
            trainingFrequency: 3,
            planWeeks: 8,
          }),
        },
      };
    },
  });
  try {
    const result = await intakeObjective({ messages: [{ role: "user", content: "10 km" }] });
    assert.equal(result.complete, true);
    assert.equal(result.objectif.title, "Courir 10 km");
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake normalise difficulté et nombres écrits par Ollama", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { message: { content: JSON.stringify({ complete: true, objectif: {
        title: "Courir 10 km", metricLabel: "distance", unit: "km", targetValue: "10 km",
        difficulty: "intermédiaire", niveau: "intermédiaire", objectiveType: "distance",
        trainingFrequency: "3 séances par semaine", planWeeks: "8 semaines",
      } }) } };
    },
  });
  try {
    const result = await intakeObjective({ messages: [{ role: "user", content: "10 km" }] });
    assert.equal(result.objectif.difficulty, "moyen");
    assert.equal(result.objectif.trainingFrequency, 3);
    assert.equal(result.objectif.planWeeks, 8);
  } finally {
    global.fetch = previousFetch;
  }
});
