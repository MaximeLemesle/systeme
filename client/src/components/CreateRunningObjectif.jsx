import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AI_TIMEOUT_MS } from "../api/client";
import { Card, Button, Field, Input, Select, Badge, AiLoader, ErrorMsg } from "./ui";

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
