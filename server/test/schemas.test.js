const test = require("node:test");
const assert = require("node:assert/strict");
const { IntakeOut, ObjectifIn, CompleteTacheIn } = require("../src/validation/schemas");
const { intakeObjective } = require("../src/services/ai");

function completeSmartConversation() {
  return [
    { role: "user", content: "Courir 10 km" },
    { role: "assistant", content: "Souhaites-tu fixer un temps cible pour cet objectif ?" },
    { role: "user", content: "Oui, 50 minutes" },
    { role: "assistant", content: "Pour quelle date précise souhaites-tu atteindre cet objectif ?" },
    { role: "user", content: "01/10/2026" },
  ];
}

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
    const result = await intakeObjective({ messages: completeSmartConversation() });
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
    const result = await intakeObjective({ messages: completeSmartConversation() });
    assert.equal(result.objectif.difficulty, "moyen");
    assert.equal(result.objectif.trainingFrequency, 3);
    assert.equal(result.objectif.planWeeks, 8);
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake normalise la casse des enums produits par Ollama", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { message: { content: JSON.stringify({ complete: true, objectif: {
        title: "Courir 10 km", metricLabel: "distance", unit: "km", targetValue: 10,
        difficulty: "Facile", niveau: "Avancé", objectiveType: "Distance",
        trainingFrequency: 3, planWeeks: 8,
      } }) } };
    },
  });
  try {
    const result = await intakeObjective({ messages: completeSmartConversation() });
    assert.equal(result.objectif.difficulty, "facile");
    assert.equal(result.objectif.niveau, "avancé");
    assert.equal(result.objectif.objectiveType, "distance");
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake ignore les estimations optionnelles hors limites produites par Ollama", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { message: { content: JSON.stringify({ complete: true, objectif: {
        title: "Courir 10 km", metricLabel: "distance", unit: "km", targetValue: 10,
        difficulty: "moyen", niveau: "intermédiaire", objectiveType: "distance",
        trainingFrequency: 3, planWeeks: 8,
        vmaKmh: 7, targetDistanceKm: 0, targetTimeSeconds: 90_000,
        deadline: "quand je serai prêt",
      } }) } };
    },
  });
  try {
    const result = await intakeObjective({ messages: completeSmartConversation() });
    assert.equal(result.complete, true);
    assert.equal(result.objectif.vmaKmh, null);
    assert.equal(result.objectif.targetDistanceKm, null);
    assert.equal(result.objectif.targetTimeSeconds, null);
    assert.equal(result.objectif.deadline, null);
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake finalise sans boucler quand la sortie finale reste invalide", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { message: { content: JSON.stringify({ complete: true, objectif: {
        title: "Progresser en course", metricLabel: "distance", unit: "km", targetValue: 0,
        difficulty: "moyen", niveau: "intermédiaire", objectiveType: "distance",
        trainingFrequency: 3, planWeeks: 8,
      } }) } };
    },
  });
  try {
    const result = await intakeObjective({ messages: completeSmartConversation() });
    assert.equal(result.complete, true);
    assert.equal(result.objectif.targetValue, 10);
    assert.equal(result.objectif.targetTimeSeconds, 3000);
  } finally {
    global.fetch = previousFetch;
  }
});

test("le retry explique à Ollama pourquoi sa première sortie est invalide", async () => {
  const previousFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const targetValue = requests.length === 1 ? 0 : 10;
    return {
      ok: true,
      async json() {
        return { message: { content: JSON.stringify({ complete: true, objectif: {
          title: "Courir 10 km", metricLabel: "distance", unit: "km", targetValue,
          difficulty: "moyen", niveau: "intermédiaire", objectiveType: "distance",
          trainingFrequency: 3, planWeeks: 8,
        } }) } };
      },
    };
  };
  try {
    const result = await intakeObjective({ messages: completeSmartConversation() });
    assert.equal(result.objectif.targetValue, 10);
    assert.equal(requests.length, 2);
    assert.match(requests[1].messages.at(-1).content, /objectif\.targetValue/);
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake ignore une nouvelle question Ollama quand les informations sont complètes", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            message: "Souhaites-tu atteindre les 10 km dans un temps précis ?",
          }),
        },
      };
    },
  });
  try {
    const result = await intakeObjective({ messages: completeSmartConversation() });
    assert.equal(result.complete, true);
    assert.equal(result.question, null);
    assert.equal(result.objectif.targetDistanceKm, 10);
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake complète les champs techniques d'un objectif SMART minimal", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            objectif: {
              title: "Courir 10 km en moins de 50 minutes avant le 1er octobre 2026",
              targetValue: 10,
              targetDistanceKm: 10,
              targetTimeSeconds: 3000,
              deadline: "2026-10-01",
            },
          }),
        },
      };
    },
  });
  try {
    const result = await intakeObjective({
      messages: completeSmartConversation(),
      niveau: "intermédiaire",
    });
    assert.equal(result.complete, true);
    assert.equal(result.objectif.metricLabel, "distance");
    assert.equal(result.objectif.unit, "km");
    assert.equal(result.objectif.niveau, "intermédiaire");
    assert.equal(result.objectif.objectiveType, "chrono");
    assert.equal(result.objectif.trainingFrequency, 3);
    assert.ok(result.objectif.planWeeks >= 5 && result.objectif.planWeeks <= 20);
  } finally {
    global.fetch = previousFetch;
  }
});

test("le prompt final demande uniquement une reformulation SMART", async () => {
  const previousFetch = global.fetch;
  let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return { message: { content: JSON.stringify({
          complete: false,
          question: "Souhaites-tu fixer un temps cible ?",
          objectif: null,
        }) } };
      },
    };
  };
  try {
    await intakeObjective({ messages: completeSmartConversation() });
    const instructions = request.messages.map((message) => message.content).join("\n");
    assert.match(instructions, /ne pose aucune question/i);
    assert.match(instructions, /objectif SMART/i);
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake passe à la date après le refus d'un temps cible", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => {
    assert.fail("Ollama ne doit pas être appelé tant que les précisions SMART ne sont pas complètes");
  };
  try {
    const result = await intakeObjective({
      messages: [
        { role: "user", content: "Courir 1 km" },
        { role: "assistant", content: "Souhaites-tu fixer un temps cible pour cet objectif ?" },
        { role: "user", content: "Non je veux juste réussir à faire 1 km" },
      ],
    });
    assert.equal(result.complete, false);
    assert.match(result.question, /quelle date/i);
    assert.doesNotMatch(result.question, /temps cible/i);
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake reprend un historique en boucle sans répéter la question oui non", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => {
    assert.fail("Ollama ne doit pas choisir la prochaine question");
  };
  try {
    const result = await intakeObjective({
      messages: [
        { role: "user", content: "Courir 1 km" },
        { role: "assistant", content: "Souhaites-tu fixer un temps cible pour cet objectif ?" },
        { role: "user", content: "Non je veux juste réussir à faire 1 km" },
        { role: "assistant", content: "Veux-tu fixer une distance cible pour 1 km ?" },
        { role: "user", content: "Oui" },
        { role: "assistant", content: "Veux-tu fixer un temps cible pour 1 km ?" },
        { role: "user", content: "non" },
        { role: "assistant", content: "Veux-tu fixer un temps cible pour 1 km ?" },
        { role: "user", content: "oui" },
      ],
    });
    assert.equal(result.complete, false);
    assert.match(result.question, /quel temps souhaites-tu viser/i);
    assert.doesNotMatch(result.question, /souhaites-tu fixer/i);
  } finally {
    global.fetch = previousFetch;
  }
});

test("l'intake suit chaque étape SMART une seule fois", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => {
    assert.fail("Ollama ne doit être appelé qu'après la date");
  };
  try {
    const messages = [{ role: "user", content: "Courir 5 km" }];
    const timeChoice = await intakeObjective({ messages });
    assert.match(timeChoice.question, /temps cible/i);

    messages.push({ role: "assistant", content: timeChoice.question }, { role: "user", content: "oui" });
    const timeValue = await intakeObjective({ messages });
    assert.match(timeValue.question, /quel temps souhaites-tu viser/i);

    messages.push({ role: "assistant", content: timeValue.question }, { role: "user", content: "30 minutes" });
    const deadline = await intakeObjective({ messages });
    assert.match(deadline.question, /quelle date précise/i);
  } finally {
    global.fetch = previousFetch;
  }
});
