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
  const [answer, setAnswer] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState(null);

  const intake = useMutation({
    mutationFn: (conversation) =>
      api("/ai/objectifs/intake", {
        method: "POST",
        body: { messages: conversation, niveau },
        timeoutMs: AI_TIMEOUT_MS,
      }),
    onSuccess: (data, conversation) => {
      setAnswer("");
      if (data.complete) {
        setMessages(conversation);
        setDraft(data.objectif);
      } else {
        setMessages([...conversation, { role: "assistant", content: data.question }]);
      }
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/domaines/${domaine.id}/objectifs`, {
        method: "POST",
        body: {
          ...draft,
          rawInput: messages.find((message) => message.role === "user")?.content || null,
          aiRefined: true,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domaines"] });
      qc.invalidateQueries({ queryKey: ["domaine-progress", domaine.id] });
    },
  });

  function submitAnswer(event) {
    event.preventDefault();
    const content = answer.trim();
    if (!content) return;
    intake.mutate([...messages, { role: "user", content }]);
  }

  function reset() {
    setMessages([]);
    setDraft(null);
    setAnswer("");
    intake.reset();
  }

  const questionsAsked = messages.filter((message) => message.role === "assistant").length;

  return (
    <Card className="space-y-5 border-[#3477a8]/20 bg-[#fffaf0]/95">
      <div>
        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#d95f45]">Nouvel objectif</span>
        <h2 className="mt-1 text-2xl font-black text-[#18212a]">Prépare ta prochaine course</h2>
        <p className="text-sm font-medium text-[#7d705e]">
          Décris librement ta cible. Le coach peut poser jusqu&apos;à quatre questions avant de la structurer.
        </p>
      </div>

      <Field label="Niveau actuel">
        <Select value={niveau} onChange={(event) => setNiveau(event.target.value)} disabled={messages.length > 0}>
          {NIVEAUX.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>

      {messages.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-lg border-2 px-3 py-2 text-sm font-medium ${
                message.role === "assistant"
                  ? "border-[#3477a8]/20 bg-[#e9f3fb] text-[#244d73]"
                  : "ml-auto max-w-[90%] border-[#1f6f5f]/20 bg-[#1f6f5f]/10 text-[#174d42]"
              }`}
            >
              <span className="mr-2 font-black">{message.role === "assistant" ? "Coach" : "Moi"}</span>
              {message.content}
            </div>
          ))}
        </div>
      )}

      {!draft && (
        <form onSubmit={submitAnswer} className="space-y-3">
          <Field label={messages.length ? "Ta réponse" : "Ton objectif"}>
            <Input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Ex. Courir 10 km en moins de 50 minutes"
              maxLength={1000}
              disabled={intake.isPending}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!answer.trim() || intake.isPending}>
              {messages.length ? "Répondre" : "Commencer"}
            </Button>
            <span className="text-xs font-bold text-[#7d705e]">{questionsAsked} / 4 questions</span>
          </div>
        </form>
      )}

      {intake.isPending && <AiLoader label="Le coach analyse ton objectif…" />}
      {intake.isError && <ErrorMsg>{intake.error.message}</ErrorMsg>}
      {create.isError && <ErrorMsg>{create.error.message}</ErrorMsg>}

      {draft && (
        <div className="space-y-3 rounded-lg border-2 border-[#1f6f5f]/20 bg-[#1f6f5f]/10 p-4">
          <div className="flex flex-wrap gap-2">
            <Badge color={diffColor[draft.difficulty]}>{draft.difficulty}</Badge>
            <Badge>{draft.niveau}</Badge>
          </div>
          <h3 className="text-xl font-black text-[#18212a]">{draft.title}</h3>
          <p className="text-sm font-medium text-[#6c5a3a]">
            {draft.targetDistanceKm || draft.targetValue} {draft.unit || ""} · {draft.trainingFrequency} séances/semaine · {draft.planWeeks} semaines
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Création…" : "Valider cet objectif"}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={create.isPending}>Recommencer</Button>
          </div>
        </div>
      )}
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
          finir une distance, échéance, fréquence) puis te proposera un objectif prêt à lancer.
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
            {creating ? "Création…" : "Lancer cet objectif"}
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
