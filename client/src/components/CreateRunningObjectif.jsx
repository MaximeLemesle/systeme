// Création d'objectif de course, guidée par le coach IA (intake conversationnel) :
//  1. Choix du niveau
//  2. Discussion avec le coach → objectif SMART proposé (archétype, distance, cible, échéance, fréquence)
//  3. Lancement → création de l'objectif (puis génération déterministe du plan sur la page principale)
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AI_TIMEOUT_MS } from "../api/client";
import { Card, Button, Field, Select, Badge, AiLoader, ErrorMsg, Textarea } from "./ui";

const NIVEAUX = [
  ["débutant", "Débutant"],
  ["intermédiaire", "Intermédiaire"],
  ["avancé", "Avancé"],
];
const diffColor = { facile: "green", moyen: "amber", difficile: "violet" };

export default function CreateObjectif({ domaine }) {
  const qc = useQueryClient();
  const [niveau, setNiveau] = useState("débutant");

  const create = useMutation({
    mutationFn: (body) => api(`/domaines/${domaine.id}/objectifs`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domaines"] });
      qc.invalidateQueries({ queryKey: ["domaine-progress", domaine.id] });
    },
  });

  // Crée l'objectif issu de la discussion IA (archétype + distance de référence + fréquence).
  function createFromIntake(obj, firstMessage) {
    create.mutate({
      title: obj.title,
      metricLabel: obj.metric_label,
      unit: obj.unit ?? null,
      startValue: obj.start_value ?? null,
      // L'estimation courante démarre à la valeur de départ (si connue).
      currentValue: obj.start_value ?? null,
      targetValue: obj.target_value,
      targetDistanceKm: obj.target_distance_km,
      archetype: obj.archetype,
      frequency: obj.frequency,
      difficulty: obj.difficulty,
      deadline: obj.deadline,
      rawInput: firstMessage || null,
      niveau,
      aiRefined: true,
    });
  }

  return (
    <Card className="space-y-6 border-[#3477a8]/20 bg-[#fffaf0]/95">
      <div>
        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#d95f45]">Nouvelle quête</span>
        <h2 className="mt-1 text-2xl font-black text-[#18212a]">Choisis ta prochaine cible</h2>
        <p className="text-sm font-medium text-[#7d705e]">
          Décris ton objectif de course, le coach affine avec toi puis construit ton plan.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ton niveau">
          <Select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
            {NIVEAUX.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
      </div>

      {create.isError && <ErrorMsg>{create.error.message}</ErrorMsg>}

      <IntakeChat niveau={niveau} onProposal={createFromIntake} creating={create.isPending} />
    </Card>
  );
}

// Discussion IA multi-tours : recueille les infos SMART (archétype, distance, cible,
// échéance, fréquence), puis propose un objectif prêt à lancer. Le serveur pose au plus 4 questions.
function IntakeChat({ niveau, onProposal, creating }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [proposal, setProposal] = useState(null);

  const send = useMutation({
    mutationFn: (msgs) =>
      api("/ai/objectifs/intake", {
        method: "POST",
        body: { niveau, messages: msgs },
        timeoutMs: AI_TIMEOUT_MS,
      }),
    onSuccess: (data, msgs) => {
      setMessages([...msgs, { role: "assistant", content: data.assistant }]);
      if (data.done && data.objectif) setProposal(data.objectif);
    },
  });

  const firstMessage = messages.find((m) => m.role === "user")?.content || null;

  function submit(e) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setProposal(null);
    send.mutate(next);
  }

  function reset() {
    setMessages([]);
    setInput("");
    setProposal(null);
    send.reset();
  }

  return (
    <section className="space-y-3 rounded-lg border-2 border-[#7150a4]/25 bg-[#f3effb]/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-[#18212a]">🧭 Coach IA (discussion)</h3>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-black text-[#7150a4] underline-offset-2 hover:underline"
          >
            Recommencer
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <p className="text-sm font-medium text-[#6c5a3a]">
          Décris ton objectif de course : le coach te posera quelques questions (temps cible ou juste
          finir une distance, échéance, fréquence) puis te proposera une quête prête à lancer.
        </p>
      ) : (
        <div className="space-y-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm font-medium ${
                m.role === "user"
                  ? "ml-auto bg-[#1f6f5f] text-white"
                  : "bg-white text-[#3a2f1e] shadow-sm"
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
      )}

      {send.isPending && <AiLoader label="Le coach réfléchit…" />}
      {send.isError && <ErrorMsg>{send.error.message}</ErrorMsg>}

      {/* Proposition finale */}
      {proposal && !send.isPending && (
        <div className="animate-pop rounded-lg border-2 border-[#1f6f5f]/20 bg-[#1f6f5f]/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={diffColor[proposal.difficulty]}>{proposal.difficulty}</Badge>
            <Badge>{proposal.archetype === "chrono" ? "Temps cible" : "Finir la distance"}</Badge>
            <Badge>{proposal.frequency} séances/sem</Badge>
          </div>
          <p className="mt-1 font-black text-[#18212a]">{proposal.title}</p>
          <p className="text-sm font-medium text-[#7d705e]">
            Cible : {proposal.target_value} {proposal.unit || ""} sur {proposal.target_distance_km} km
            {proposal.deadline ? ` · échéance ${proposal.deadline}` : ""}
          </p>
          {proposal.faisabilite && (
            <p className="mt-2 text-sm italic text-[#6c5a3a]">{proposal.faisabilite}</p>
          )}
          <Button
            className="mt-3"
            onClick={() => onProposal(proposal, firstMessage)}
            disabled={creating}
          >
            {creating ? "Création…" : "Lancer cette quête"}
          </Button>
        </div>
      )}

      {/* Champ de saisie (tant qu'il n'y a pas de proposition) */}
      {!proposal && (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            rows={2}
            placeholder={
              messages.length === 0
                ? "ex : je veux améliorer mon temps sur 5 km"
                : "Ta réponse…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
          />
          <Button
            type="submit"
            variant="ghost"
            disabled={!input.trim() || send.isPending}
            className="whitespace-nowrap"
          >
            Envoyer
          </Button>
        </form>
      )}
    </section>
  );
}
