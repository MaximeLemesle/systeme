const { IntakeOut } = require("../validation/schemas");
const { env } = require("../config/env");

const LLM_TIMEOUT_MS = 150_000;
const JSON_RULE = "Réponds uniquement avec un objet JSON valide, sans texte autour ni backticks.";

function numberFromText(value) {
  if (typeof value !== "string") return value;
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : value;
}

function normalizeObjective(objectif) {
  if (!objectif || typeof objectif !== "object") return objectif;
  const normalized = { ...objectif };
  // Le modèle utilise parfois le niveau du coureur comme difficulté.
  const difficultyAliases = { débutant: "facile", intermédiaire: "moyen", avancé: "difficile" };
  if (difficultyAliases[normalized.difficulty]) normalized.difficulty = difficultyAliases[normalized.difficulty];
  for (const key of ["targetValue", "trainingFrequency", "planWeeks", "vmaKmh", "targetDistanceKm", "targetTimeSeconds"]) {
    if (normalized[key] !== undefined && normalized[key] !== null) normalized[key] = numberFromText(normalized[key]);
  }
  return normalized;
}

async function callLlmJson(system, user) {
  const response = await fetch(`${env.OLLAMA_URL}/api/chat`, {
    method: "POST",
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OLLAMA_MODEL,
      format: "json",
      stream: false,
      keep_alive: "10m",
      options: { temperature: 0.2, num_predict: 900 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const data = await response.json();
  const parsed = JSON.parse(data.message.content);
  // Les petits modèles omettent parfois l'enveloppe demandée et renvoient
  // directement l'objectif ou la question. On rétablit l'enveloppe avant
  // la validation stricte du contrat IA.
  if (typeof parsed.complete !== "boolean") {
    if (parsed.objectif && typeof parsed.objectif === "object") {
      return { complete: true, question: null, objectif: normalizeObjective(parsed.objectif) };
    }
    if (parsed.title && parsed.metricLabel && parsed.targetValue !== undefined) {
      return { complete: true, question: null, objectif: normalizeObjective(parsed) };
    }
    if (typeof parsed.question === "string" && parsed.question.trim()) {
      return { complete: false, question: parsed.question, objectif: null };
    }
  }
  if (parsed.objectif) parsed.objectif = normalizeObjective(parsed.objectif);
  return parsed;
}

async function generateValidated(system, user) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return IntakeOut.parse(await callLlmJson(system, user));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`sortie invalide après un retry (${lastError?.message || "erreur inconnue"})`);
}

async function intakeObjective({ messages, niveau = "débutant", mustComplete = false }) {
  const system = `Tu es un coach de course à pied. Tu clarifies un objectif puis tu produis un objectif SMART en français. ${JSON_RULE}`;
  const completionRule = mustComplete
    ? "Finalise maintenant avec des hypothèses prudentes. Ne pose plus de question."
    : "S'il manque une information indispensable, pose une seule question courte. Sinon finalise.";
  const user = `Date : ${new Date().toISOString().slice(0, 10)}.
Niveau déclaré : ${niveau}.
Conversation : ${JSON.stringify(messages)}.
${completionRule}
L'objectif final précise distance, échéance, fréquence de 2 à 5 séances et plan de 5 à 20 semaines. Pour un chrono, ajoute le temps cible en secondes.
Question : {"complete":false,"question":"...","objectif":null}.
Final : {"complete":true,"question":null,"objectif":{"title","description","metricLabel","unit","targetValue","difficulty","niveau","objectiveType","deadline","trainingFrequency","planWeeks","vmaKmh","targetDistanceKm","targetTimeSeconds"}}.`;

  const result = await generateValidated(system, user);
  if (mustComplete && !result.complete) {
    throw new Error("le modèle n'a pas finalisé l'objectif après quatre questions");
  }
  return result;
}

async function warmupLlm() {
  try {
    await fetch(`${env.OLLAMA_URL}/api/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        stream: false,
        keep_alive: "30m",
        options: { num_predict: 1 },
        messages: [{ role: "user", content: "ok" }],
      }),
    });
    console.log(`IA préchargée (${env.OLLAMA_MODEL})`);
  } catch {
    console.warn("IA non préchargée (Ollama indisponible). Elle chargera au premier appel.");
  }
}

module.exports = { intakeObjective, warmupLlm };
