const { IntakeOut } = require("../validation/schemas");
const { env } = require("../config/env");

const LLM_TIMEOUT_MS = 150_000;
const JSON_RULE = "Réponds uniquement avec un objet JSON valide, sans texte autour ni backticks.";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DIFFICULTIES = new Set(["facile", "moyen", "difficile"]);
const RUNNER_LEVELS = new Set(["débutant", "intermédiaire", "avancé"]);
const OBJECTIVE_TYPES = new Set(["endurance", "chrono", "distance", "regularite"]);
const OPTIONAL_NUMBER_RULES = {
  vmaKmh: (value) => Number.isFinite(value) && value >= 8 && value <= 25,
  targetDistanceKm: (value) => Number.isFinite(value) && value > 0 && value <= 100,
  targetTimeSeconds: (value) => Number.isInteger(value) && value > 0 && value <= 86_400,
};

function numberFromText(value) {
  if (typeof value !== "string") return value;
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : value;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function planWeeksForDeadline(deadline) {
  if (!deadline) return 8;
  const weeks = Math.ceil((new Date(`${deadline}T00:00:00.000Z`).getTime() - Date.now()) / WEEK_MS);
  return Math.min(20, Math.max(5, weeks));
}

function normalizeObjective(objectif, { niveau = "débutant" } = {}) {
  if (!objectif || typeof objectif !== "object") return objectif;
  const normalized = { ...objectif };
  normalized.title ||= normalized.smartObjective || normalized.objectifSmart || normalized.reformulation;
  for (const key of ["difficulty", "niveau", "objectiveType"]) {
    if (typeof normalized[key] === "string") {
      normalized[key] = normalized[key].trim().toLocaleLowerCase("fr-FR");
    }
  }
  // Le modèle utilise parfois le niveau du coureur comme difficulté.
  const difficultyAliases = { débutant: "facile", intermédiaire: "moyen", avancé: "difficile" };
  if (difficultyAliases[normalized.difficulty]) normalized.difficulty = difficultyAliases[normalized.difficulty];
  for (const key of ["targetValue", "trainingFrequency", "planWeeks", "vmaKmh", "targetDistanceKm", "targetTimeSeconds"]) {
    if (normalized[key] !== undefined && normalized[key] !== null) normalized[key] = numberFromText(normalized[key]);
  }
  for (const [key, isValid] of Object.entries(OPTIONAL_NUMBER_RULES)) {
    if (normalized[key] !== undefined && normalized[key] !== null && !isValid(normalized[key])) {
      normalized[key] = null;
    }
  }
  if (typeof normalized.deadline === "string") {
    normalized.deadline = normalized.deadline.trim();
    if (!isIsoDate(normalized.deadline)) normalized.deadline = null;
  }
  if (!(normalized.targetValue > 0) && normalized.targetDistanceKm > 0) {
    normalized.targetValue = normalized.targetDistanceKm;
  }
  normalized.metricLabel ||= "distance";
  normalized.unit ||= "km";
  if (!DIFFICULTIES.has(normalized.difficulty)) normalized.difficulty = "moyen";
  if (!RUNNER_LEVELS.has(normalized.niveau)) {
    const declaredLevel = String(niveau).trim().toLocaleLowerCase("fr-FR");
    normalized.niveau = RUNNER_LEVELS.has(declaredLevel) ? declaredLevel : "débutant";
  }
  if (!OBJECTIVE_TYPES.has(normalized.objectiveType)) {
    normalized.objectiveType = normalized.targetTimeSeconds ? "chrono" : "distance";
  }
  if (!Number.isInteger(normalized.trainingFrequency) || normalized.trainingFrequency < 2 || normalized.trainingFrequency > 5) {
    normalized.trainingFrequency = 3;
  }
  if (!Number.isInteger(normalized.planWeeks) || normalized.planWeeks < 5 || normalized.planWeeks > 20) {
    normalized.planWeeks = planWeeksForDeadline(normalized.deadline);
  }
  normalized.vmaKmh ??= null;
  return normalized;
}

function validationFeedback(error) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "réponse"}: ${issue.message}`)
    .join("; ");
}

function clarificationQuestion(error, fallbackQuestion) {
  const fields = new Set(error.issues.map((issue) => issue.path.at(-1)));
  if (["title", "metricLabel", "targetValue"].some((field) => fields.has(field))) {
    return "Quelle distance ou quel chrono précis souhaites-tu atteindre ?";
  }
  if (fields.has("trainingFrequency")) {
    return "Combien de séances peux-tu faire chaque semaine, entre 2 et 5 ?";
  }
  if (fields.has("planWeeks")) {
    return "Sur combien de semaines souhaites-tu préparer cet objectif, entre 5 et 20 ?";
  }
  return fallbackQuestion || "Peux-tu préciser ton objectif et la date à laquelle tu souhaites l'atteindre ?";
}

function distanceFromText(text) {
  const match = String(text).match(/\b(\d+(?:[,.]\d+)?)\s*(km|kilomètres?|m|mètres?)\b/i);
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  const unit = match[2].toLocaleLowerCase("fr-FR");
  const distanceKm = unit.startsWith("k") ? value : value / 1000;
  return distanceKm > 0 && distanceKm <= 100
    ? { distanceKm, label: `${distanceKm} km` }
    : null;
}

function durationFromText(text) {
  const value = String(text).toLocaleLowerCase("fr-FR");
  const colon = value.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (colon) {
    return colon[3]
      ? Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3])
      : Number(colon[1]) * 60 + Number(colon[2]);
  }
  const hours = value.match(/\b(\d+(?:[,.]\d+)?)\s*(?:h|heures?)\b/);
  const minutes = value.match(/\b(\d+(?:[,.]\d+)?)\s*(?:min|minutes?)\b/);
  const seconds = value.match(/\b(\d+(?:[,.]\d+)?)\s*(?:s|secondes?)\b/);
  if (!hours && !minutes && !seconds) return null;
  return Math.round(
    Number(hours?.[1]?.replace(",", ".") || 0) * 3600
      + Number(minutes?.[1]?.replace(",", ".") || 0) * 60
      + Number(seconds?.[1]?.replace(",", ".") || 0)
  );
}

function deadlineFromText(text) {
  const value = String(text).trim().toLocaleLowerCase("fr-FR");
  const iso = value.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (iso && isIsoDate(iso)) return iso;

  const numeric = value.match(/\b(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})\b/);
  if (numeric) {
    const candidate = `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
    if (isIsoDate(candidate)) return candidate;
  }

  const months = {
    janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  };
  const written = value.match(/\b(\d{1,2})(?:er)?\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})\b/);
  if (!written) return null;
  const candidate = `${written[3]}-${String(months[written[2]]).padStart(2, "0")}-${written[1].padStart(2, "0")}`;
  return isIsoDate(candidate) ? candidate : null;
}

function questionType(text) {
  const value = String(text).toLocaleLowerCase("fr-FR");
  if (/distance|combien de (?:km|kilomètres|mètres)/.test(value)) return "distance";
  if (/date|échéance|quand/.test(value)) return "deadline";
  if (/quel temps|combien de temps|temps souhaites-tu|temps veux-tu/.test(value)) return "timeValue";
  if (/temps cible|chrono|durée/.test(value)) return "timeChoice";
  return null;
}

function isPositiveAnswer(text) {
  return /^(?:oui|yes|ok|d'accord|d’accord|je veux|avec)\b/i.test(String(text).trim());
}

function isNegativeAnswer(text) {
  return /^(?:non|no|sans|pas de)\b|\b(?:juste|seulement) (?:finir|réussir)/i.test(String(text).trim());
}

function smartConversationState(messages) {
  const state = { distance: null, timeChoice: null, targetTimeSeconds: null, deadline: null };
  for (const message of messages.filter((item) => item.role === "user")) {
    state.distance = distanceFromText(message.content) || state.distance;
    state.targetTimeSeconds = durationFromText(message.content) || state.targetTimeSeconds;
    state.deadline = deadlineFromText(message.content) || state.deadline;
  }
  if (state.targetTimeSeconds) state.timeChoice = true;

  for (let index = 0; index < messages.length - 1; index += 1) {
    if (messages[index].role !== "assistant" || messages[index + 1].role !== "user") continue;
    const type = questionType(messages[index].content);
    const answer = messages[index + 1].content;
    if (type === "distance") state.distance = distanceFromText(answer) || state.distance;
    if (type === "deadline") state.deadline = deadlineFromText(answer) || state.deadline;
    if (type === "timeChoice" || type === "timeValue") {
      const duration = durationFromText(answer);
      if (duration) {
        state.timeChoice = true;
        state.targetTimeSeconds = duration;
      } else if (isNegativeAnswer(answer)) {
        state.timeChoice = false;
        state.targetTimeSeconds = null;
      } else if (isPositiveAnswer(answer)) {
        state.timeChoice = true;
        state.targetTimeSeconds = null;
      }
    }
  }
  return state;
}

function nextSmartQuestion(state) {
  if (!state.distance) return "Quelle distance souhaites-tu réussir à courir ?";
  if (state.timeChoice === null) return "Souhaites-tu fixer un temps cible pour cet objectif ?";
  if (state.timeChoice && !state.targetTimeSeconds) {
    return `Quel temps souhaites-tu viser pour ${state.distance.label} ?`;
  }
  if (!state.deadline) return "Pour quelle date précise souhaites-tu atteindre cet objectif ? (JJ/MM/AAAA)";
  return null;
}

function fallbackObjective(state) {
  const timeLabel = state.targetTimeSeconds
    ? ` en ${Math.round(state.targetTimeSeconds / 60)} minutes`
    : "";
  return {
    title: `Courir ${state.distance.label}${timeLabel} avant le ${state.deadline}`,
    targetValue: state.distance.distanceKm,
    targetDistanceKm: state.distance.distanceKm,
    targetTimeSeconds: state.targetTimeSeconds,
    deadline: state.deadline,
  };
}

function normalizeLlmOutput(parsed, context) {
  if (typeof parsed === "string" && parsed.trim()) {
    return { complete: false, question: parsed.trim(), objectif: null };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;

  if (parsed.complete === "true") parsed.complete = true;
  if (parsed.complete === "false") parsed.complete = false;
  const question = [parsed.question, parsed.message, parsed.response, parsed.assistant, parsed.content]
    .find((value) => typeof value === "string" && value.trim())
    ?.trim();
  if (parsed.complete === false && question) {
    return { complete: false, question, objectif: null };
  }

  const objectif = parsed.objectif || parsed.objective || parsed.goal;
  if (objectif && typeof objectif === "object") {
    return { complete: true, question: null, objectif: normalizeObjective(objectif, context) };
  }
  if (question) return { complete: false, question, objectif: null };

  const directObjective = normalizeObjective(parsed, context);
  if (directObjective.title && directObjective.targetValue !== undefined) {
    return { complete: true, question: null, objectif: directObjective };
  }
  return parsed;
}

async function callLlmJson(system, user, context) {
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
  const content = data.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (typeof content !== "string" || /^[\s]*[\[{]/.test(content)) throw error;
    parsed = content;
  }
  return normalizeLlmOutput(parsed, context);
}

async function generateValidated(system, user, { fallbackQuestion, niveau } = {}) {
  let lastError;
  let nextUser = user;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return IntakeOut.parse(await callLlmJson(system, nextUser, { niveau }));
    } catch (error) {
      lastError = error;
      if (Array.isArray(error.issues)) {
        nextUser = `${user}
Ta sortie précédente ne respecte pas le contrat (${validationFeedback(error)}).
Corrige ces champs. Si une valeur indispensable dépend de l'utilisateur, renvoie plutôt une seule question courte au format Question.`;
      }
    }
  }
  if (Array.isArray(lastError?.issues)) {
    return { complete: false, question: clarificationQuestion(lastError, fallbackQuestion), objectif: null };
  }
  throw new Error(`sortie invalide après un retry (${lastError?.message || "erreur inconnue"})`);
}

async function intakeObjective({ messages, niveau = "débutant" }) {
  const state = smartConversationState(messages);
  const question = nextSmartQuestion(state);
  if (question) return { complete: false, question, objectif: null };

  const system = `Ta mission unique est de reformuler la conversation en un objectif SMART clair et motivant. Toutes les précisions nécessaires ont déjà été recueillies : ne pose aucune question. Conserve exactement la distance, le choix de chrono et la date fournis. ${JSON_RULE}`;
  const user = `Date : ${new Date().toISOString().slice(0, 10)}.
Niveau déclaré : ${niveau}.
Conversation : ${JSON.stringify(messages)}.
Question : {"complete":false,"question":"...","objectif":null}.
Final : {"complete":true,"question":null,"objectif":{"title":"objectif SMART reformulé","targetValue":10,"targetDistanceKm":10,"targetTimeSeconds":3000,"deadline":"YYYY-MM-DD"}}. targetTimeSeconds vaut null si le coureur ne souhaite pas de chrono.`;

  const result = await generateValidated(system, user, {
    fallbackQuestion: "Reformule l'objectif SMART proposé.",
    niveau,
  });
  if (result.complete) return result;
  return {
    complete: true,
    question: null,
    objectif: normalizeObjective(fallbackObjective(state), { niveau }),
  };
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
