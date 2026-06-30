// Service IA — appelé UNIQUEMENT côté backend. Spécialisé "course à pied".
// Trois usages : proposer des objectifs, raffiner un objectif libre, générer un plan d'entraînement.
// Toujours sortie JSON validée avec Zod ; 1 retry si invalide, sinon erreur propagée (502 côté route).
const { SuggestionsOut, RefineOut, TrainingPlanOut } = require("../validation/schemas");

const PROVIDER = process.env.AI_PROVIDER || "ollama";

// Appel LLM générique renvoyant un objet JSON parsé.
async function callLlmJson(system, user) {
  if (PROVIDER === "ollama") {
    const res = await fetch(`${process.env.OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL,
        format: "json",
        stream: false,
        keep_alive: "10m", // garde le modèle chargé entre les appels
        options: {
          temperature: 0.2, // sorties plus déterministes = JSON plus fiable & moins bavard
          num_predict: 1100, // borne la génération (anti-emballement)
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    return JSON.parse(data.message.content);
  }

  // Mistral cloud (fallback optionnel)
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// Valide la sortie ; 1 retry si le JSON ne respecte pas le schéma.
async function generateValidated(system, user, schema) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callLlmJson(system, user);
      return schema.parse(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`IA: sortie invalide (${lastErr?.message || "inconnue"})`);
}

const JSON_RULE =
  "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans backticks.";
const FR_RULE =
  "IMPORTANT : rédige absolument TOUT le texte (titres, descriptions, labels, conseils) en FRANÇAIS correct et naturel. Aucun mot en anglais.";

const today = () => new Date().toISOString().slice(0, 10);

// Descriptions lisibles des types d'objectif de course (pour guider le LLM).
const TYPE_LABELS = {
  endurance: "Endurance : courir plus longtemps sans s'arrêter (durée ou distance continue)",
  chrono: "Chrono : atteindre un temps cible sur une distance (ex : 5 km en 30 min)",
  distance: "Distance : augmenter la distance parcourue (ex : réussir son premier 10 km)",
  regularite: "Régularité : courir régulièrement (ex : 3 sorties par semaine pendant 1 mois)",
};

// Propose 3 objectifs SMART de course adaptés au niveau et au type visé.
async function suggestRunningObjectives({ niveau = "débutant", objectiveType = "endurance" }) {
  const typeLabel = TYPE_LABELS[objectiveType] || TYPE_LABELS.endurance;
  const system = `Tu es un coach de course à pied bienveillant et expert. ${FR_RULE} ${JSON_RULE}`;
  const user = `Date du jour : ${today()}.
Profil du coureur — Niveau : ${niveau}. Type d'objectif visé : ${typeLabel}.
Propose EXACTEMENT 3 objectifs de course SMART progressifs (du plus accessible au plus ambitieux), réalistes et mesurables, adaptés à ce niveau.
Sois CONCIS : "title" max 12 mots, "metric_label" 1 à 3 mots (ex : "distance", "temps", "sorties").
Format STRICT : {"objectifs":[{"title","metric_label","unit","target_value","difficulty","deadline_suggeree"}]}.
"difficulty" ∈ facile|moyen|difficile. "deadline_suggeree" au format YYYY-MM-DD (échéance réaliste à partir d'aujourd'hui).`;
  return (await generateValidated(system, user, SuggestionsOut)).objectifs;
}

// Transforme un objectif de course libre en objectif SMART.
async function refineObjective({ objectifBrut, niveau = "débutant", objectiveType = "endurance" }) {
  const typeLabel = TYPE_LABELS[objectiveType] || TYPE_LABELS.endurance;
  const system = `Tu es un coach de course à pied qui transforme un objectif vague en objectif SMART réaliste. ${FR_RULE} ${JSON_RULE}`;
  const user = `Date du jour : ${today()}.
Profil — Niveau : ${niveau}. Type visé : ${typeLabel}.
Objectif brut du coureur : "${objectifBrut}".
Reformule-le en objectif de course SMART cohérent et atteignable pour ce niveau. Sois CONCIS (titre max 14 mots).
Format STRICT : {"title","metric_label","unit","start_value","target_value","difficulty","deadline","faisabilite"}.
"difficulty" ∈ facile|moyen|difficile. "deadline" au format YYYY-MM-DD. "faisabilite" : 1 phrase courte et honnête.`;
  return await generateValidated(system, user, RefineOut);
}

// Génère un plan d'entraînement (séances ordonnées) jusqu'à l'objectif.
async function generateTrainingPlan({ objectif, niveau = "débutant" }) {
  const system = `Tu es un coach de course à pied qui construit un plan d'entraînement progressif et sûr. ${FR_RULE} ${JSON_RULE}`;
  const user = `Niveau du coureur : ${niveau}. Objectif : ${JSON.stringify(objectif)}.
Construis un plan d'entraînement SIMPLE de 5 à 8 séances ORDONNÉES, progressives, qui mènent à l'objectif. La dernière séance EST l'objectif (jour J).
Pour chaque séance, donne un titre court et une description avec un peu de détail (durée, intensité, et 1 conseil concret).
"category" décrit le type de séance, STRICTEMENT parmi : footing | fractionne | sortie_longue | recuperation | objectif.
Format STRICT : {"seances":[{"order_index","title","description","category","est_duration_min"}]}.
"order_index" commence à 1. "est_duration_min" = durée estimée en minutes.`;
  return (await generateValidated(system, user, TrainingPlanOut)).seances;
}

module.exports = { suggestRunningObjectives, refineObjective, generateTrainingPlan };
