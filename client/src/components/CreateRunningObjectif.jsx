// Création d'objectif guidée par l'IA :
//  1. Choix du niveau
//  2. « Idées de l'IA » → 3 objectifs SMART proposés    OU    « Mon objectif » → champ libre raffiné par l'IA
//  3. Choix → création de l'objectif (puis génération du plan sur la page principale)
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
  const [rawInput, setRawInput] = useState("");
  const [refined, setRefined] = useState(null);

  const suggestions = useMutation({
    mutationFn: () =>
      api(`/domaines/${domaine.id}/objectifs/suggestions`, {
        method: "POST",
        body: { niveau },
        timeoutMs: AI_TIMEOUT_MS,
      }),
  });

  const refine = useMutation({
    mutationFn: () =>
      api("/ai/objectifs/refine", {
        method: "POST",
        body: { objectifBrut: rawInput, domaineId: domaine.id, niveau },
        timeoutMs: AI_TIMEOUT_MS,
      }),
    onSuccess: (data) => setRefined(data),
  });

  const create = useMutation({
    mutationFn: (body) => api(`/domaines/${domaine.id}/objectifs`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domaines"] });
      qc.invalidateQueries({ queryKey: ["domaine-progress", domaine.id] });
    },
  });

  function createFromSuggestion(s) {
    create.mutate({
      title: s.title,
      metricLabel: s.metric_label,
      unit: s.unit ?? null,
      targetValue: s.target_value,
      difficulty: s.difficulty,
      deadline: s.deadline_suggeree,
      niveau,
      aiRefined: true,
    });
  }

  function createFromRefined() {
    create.mutate({
      title: refined.title,
      metricLabel: refined.metric_label,
      unit: refined.unit ?? null,
      startValue: refined.start_value ?? null,
      targetValue: refined.target_value,
      difficulty: refined.difficulty,
      deadline: refined.deadline,
      rawInput,
      niveau,
      aiRefined: true,
    });
  }

  const list = suggestions.data?.objectifs;

  return (
    <Card className="space-y-6 border-[#3477a8]/20 bg-[#fffaf0]/95">
      <div>
        <span className="text-xs font-black uppercase tracking-[0.18em] text-[#d95f45]">Nouvelle quête</span>
        <h2 className="mt-1 text-2xl font-black text-[#18212a]">Choisis ta prochaine cible</h2>
        <p className="text-sm font-medium text-[#7d705e]">
          Monde : <span className="font-black text-[#46351f]">{domaine.name}</span>. Choisis ton niveau, puis laisse l'IA proposer des quêtes ou écris la tienne.
        </p>
      </div>

      {/* 1. Mini-formulaire */}
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

      {/* 2a. Idées de l'IA */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-[#18212a]">Quêtes proposées</h3>
          <Button onClick={() => suggestions.mutate()} disabled={suggestions.isPending}>
            {list ? "Régénérer" : "Forger des quêtes"}
          </Button>
        </div>
        {suggestions.isPending && <AiLoader label="L'IA prépare des quêtes adaptées…" />}
        {suggestions.isError && <ErrorMsg>{suggestions.error.message}</ErrorMsg>}

        {list && !suggestions.isPending && (
          <div className="grid gap-3">
            {list.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border-2 border-[#3d2d18]/12 bg-[#fff8e8]/85 p-3 transition hover:-translate-y-0.5 hover:border-[#3477a8]/30 hover:bg-white"
              >
                <div>
                  <Badge color={diffColor[s.difficulty]}>{s.difficulty}</Badge>
                  <p className="mt-1 font-black text-[#18212a]">{s.title}</p>
                  <p className="text-sm font-medium text-[#7d705e]">
                    Cible : {s.target_value} {s.unit || ""} ({s.metric_label}) · {s.deadline_suggeree}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => createFromSuggestion(s)}
                  disabled={create.isPending}
                  className="whitespace-nowrap"
                >
                  Choisir
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3 text-xs font-black text-[#9a8d79]">
        <div className="h-px flex-1 bg-[#3d2d18]/15" /> OU <div className="h-px flex-1 bg-[#3d2d18]/15" />
      </div>

      {/* 2b. Objectif personnalisé */}
      <section className="space-y-3">
        <h3 className="font-black text-[#18212a]">Ma quête personnalisée</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="ex : créer une app mobile en 1 mois"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && rawInput && refine.mutate()}
          />
          <Button
            variant="ghost"
            onClick={() => refine.mutate()}
            disabled={!rawInput || refine.isPending}
            className="whitespace-nowrap"
          >
            Raffiner la quête
          </Button>
        </div>
        {refine.isPending && <AiLoader label="Reformulation SMART en cours…" />}
        {refine.isError && <ErrorMsg>{refine.error.message}</ErrorMsg>}

        {refined && !refine.isPending && (
          <div className="animate-pop rounded-lg border-2 border-[#1f6f5f]/20 bg-[#1f6f5f]/10 p-4">
            <Badge color={diffColor[refined.difficulty]}>{refined.difficulty}</Badge>
            <p className="mt-1 font-black text-[#18212a]">{refined.title}</p>
            <p className="text-sm font-medium text-[#7d705e]">
              Cible : {refined.target_value} {refined.unit || ""} ({refined.metric_label})
              {refined.deadline ? ` · échéance ${refined.deadline}` : ""}
            </p>
            {refined.faisabilite && (
              <p className="mt-2 text-sm italic text-[#6c5a3a]">{refined.faisabilite}</p>
            )}
            <Button className="mt-3" onClick={createFromRefined} disabled={create.isPending}>
              {create.isPending ? "Création…" : "Lancer cette quête"}
            </Button>
          </div>
        )}
      </section>
    </Card>
  );
}
