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
    <Card className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Définis ton objectif 🎯</h2>
        <p className="text-sm text-slate-500">
          Domaine : <span className="font-semibold text-slate-700">{domaine.name}</span>. Choisis ton niveau, puis laisse l'IA te proposer des idées — ou écris le tien.
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
          <h3 className="font-semibold text-slate-700">💡 Idées de l'IA</h3>
          <Button onClick={() => suggestions.mutate()} disabled={suggestions.isPending}>
            {list ? "Régénérer" : "Proposer des objectifs"}
          </Button>
        </div>
        {suggestions.isPending && <AiLoader label="L'IA prépare des objectifs adaptés…" />}
        {suggestions.isError && <ErrorMsg>{suggestions.error.message}</ErrorMsg>}

        {list && !suggestions.isPending && (
          <div className="grid gap-3">
            {list.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div>
                  <Badge color={diffColor[s.difficulty]}>{s.difficulty}</Badge>
                  <p className="mt-1 font-semibold text-slate-800">{s.title}</p>
                  <p className="text-sm text-slate-500">
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

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" /> OU <div className="h-px flex-1 bg-slate-200" />
      </div>

      {/* 2b. Objectif personnalisé */}
      <section className="space-y-3">
        <h3 className="font-semibold text-slate-700">✍️ Mon objectif</h3>
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
            Raffiner (IA)
          </Button>
        </div>
        {refine.isPending && <AiLoader label="Reformulation SMART en cours…" />}
        {refine.isError && <ErrorMsg>{refine.error.message}</ErrorMsg>}

        {refined && !refine.isPending && (
          <div className="animate-pop rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <Badge color={diffColor[refined.difficulty]}>{refined.difficulty}</Badge>
            <p className="mt-1 font-semibold text-slate-800">{refined.title}</p>
            <p className="text-sm text-slate-500">
              Cible : {refined.target_value} {refined.unit || ""} ({refined.metric_label})
              {refined.deadline ? ` · échéance ${refined.deadline}` : ""}
            </p>
            {refined.faisabilite && (
              <p className="mt-2 text-sm italic text-slate-500">💡 {refined.faisabilite}</p>
            )}
            <Button className="mt-3" onClick={createFromRefined} disabled={create.isPending}>
              {create.isPending ? "Création…" : "Créer cet objectif"}
            </Button>
          </div>
        )}
      </section>
    </Card>
  );
}
