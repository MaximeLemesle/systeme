const test = require("node:test");
const assert = require("node:assert/strict");
const { SuggestionsOut, RefineOut, TasksOut } = require("../src/validation/schemas");

test("SuggestionsOut accepte les nombres renvoyés sous forme de chaînes par le LLM", () => {
  const parsed = SuggestionsOut.parse({
    objectifs: [
      {
        title: "Publier une app simple",
        metric_label: "app",
        unit: null,
        target_value: "1",
        difficulty: "moyen",
        deadline_suggeree: "2026-07-30",
      },
      {
        title: "Créer un prototype",
        metric_label: "prototype",
        unit: null,
        target_value: 1,
        difficulty: "facile",
        deadline_suggeree: "2026-07-15",
      },
      {
        title: "Livrer une version test",
        metric_label: "version",
        unit: null,
        target_value: 1,
        difficulty: "difficile",
        deadline_suggeree: "2026-08-15",
      },
    ],
  });

  assert.equal(parsed.objectifs[0].target_value, 1);
});

test("RefineOut valide un objectif SMART minimal", () => {
  const parsed = RefineOut.parse({
    title: "Courir 5 km sans pause",
    metric_label: "distance",
    unit: "km",
    start_value: null,
    target_value: "5",
    difficulty: "moyen",
    deadline: "2026-08-01",
    faisabilite: "Objectif réaliste avec une progression régulière.",
  });

  assert.equal(parsed.target_value, 5);
});

test("TasksOut force une catégorie générique si le LLM sort une catégorie inconnue", () => {
  const parsed = TasksOut.parse({
    taches: [
      { order_index: 1, title: "Étape 1", description: "", category: "foo", est_duration_min: "30" },
      { order_index: 2, title: "Étape 2", description: "", category: "general", est_duration_min: 30 },
      { order_index: 3, title: "Étape 3", description: "", est_duration_min: null },
    ],
  });

  assert.equal(parsed.taches[0].category, "general");
  assert.equal(parsed.taches[0].est_duration_min, 30);
});
