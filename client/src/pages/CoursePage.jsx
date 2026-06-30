// Écran principal "Course à pied" (app mono-domaine) :
//  - en-tête : niveau + XP
//  - pas d'objectif actif → formulaire de création guidé par l'IA
//  - objectif actif sans plan → bouton "Générer le plan (IA)"
//  - objectif actif avec plan → parcours Candy Crush + détail de la séance + validation
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AI_TIMEOUT_MS } from "../api/client";
import { Card, Button, Badge, Spinner, AiLoader, ErrorMsg } from "../components/ui";
import { XpBar } from "../components/bars";
import { categoryMeta } from "../lib/categories";
import TrainingPath from "../components/TrainingPath";
import CreateRunningObjectif from "../components/CreateRunningObjectif";
import RewardModal from "../components/RewardModal";

const diffColor = { facile: "green", moyen: "amber", difficile: "violet" };
const TYPE_LABEL = {
  endurance: "Endurance",
  chrono: "Chrono",
  distance: "Distance",
  regularite: "Régularité",
};

export default function CoursePage() {
  const qc = useQueryClient();
  const [reward, setReward] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["course"],
    queryFn: () => api("/me/course"),
  });

  const objectif = data?.objectifActif || null;
  const taches = useMemo(() => objectif?.taches || [], [objectif]);
  const currentId = useMemo(() => taches.find((t) => t.status !== "fait")?.id ?? null, [taches]);

  // Sélectionne par défaut la séance du jour.
  useEffect(() => {
    if (taches.length && !taches.some((t) => t.id === selectedId)) {
      setSelectedId(currentId ?? taches[0].id);
    }
  }, [taches, currentId, selectedId]);

  const generatePlan = useMutation({
    mutationFn: () =>
      api(`/objectifs/${objectif.id}/taches/generate`, { method: "POST", timeoutMs: AI_TIMEOUT_MS }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course"] }),
  });

  // Terminer une séance : log d'une session (XP serveur) + passage de la tâche à "fait".
  const completeSeance = useMutation({
    mutationFn: async (seance) => {
      const res = await api(`/objectifs/${objectif.id}/sessions`, {
        method: "POST",
        body: {
          durationMinutes: seance.estDurationMin || 30,
          difficulty: categoryMeta(seance.category).difficulty,
          tacheId: seance.id,
        },
      });
      await api(`/taches/${seance.id}`, { method: "PATCH", body: { status: "fait" } });
      return res;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["course"] });
      setReward({
        title: "Séance terminée ! 💪",
        xpEarned: res.xpEarned,
        leveledUp: res.leveledUp,
        newLevels: res.newLevels,
      });
    },
  });

  const validate = useMutation({
    mutationFn: () => api(`/objectifs/${objectif.id}/validate`, { method: "PATCH" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["course"] });
      setSelectedId(null);
      setReward({
        title: "Objectif atteint ! 🏆",
        xpEarned: res.xpEarned,
        leveledUp: res.leveledUp,
        newLevels: res.newLevels,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Spinner /> Chargement…
      </div>
    );
  }

  const domaine = data.domaine;
  const selected = taches.find((t) => t.id === selectedId) || null;
  const allDone = taches.length > 0 && taches.every((t) => t.status === "fait");

  return (
    <div className="space-y-6">
      <RewardModal reward={reward} onClose={() => setReward(null)} />

      {/* En-tête */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏃</span>
          <h1 className="text-xl font-extrabold text-slate-800">{domaine.name}</h1>
        </div>
        <XpBar totalXp={domaine.totalXp} xpToNextLevel={domaine.xpToNextLevel} level={domaine.level} />
      </Card>

      {/* Pas d'objectif actif → création guidée */}
      {!objectif && <CreateRunningObjectif domaineId={domaine.id} />}

      {/* Objectif actif */}
      {objectif && (
        <>
          <Card className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={diffColor[objectif.difficulty]}>{objectif.difficulty}</Badge>
              {objectif.objectiveType && <Badge color="sky">{TYPE_LABEL[objectif.objectiveType] || objectif.objectiveType}</Badge>}
              {objectif.niveau && <Badge>{objectif.niveau}</Badge>}
            </div>
            <h2 className="text-lg font-bold text-slate-800">{objectif.title}</h2>
            <p className="text-sm text-slate-500">
              Cible : {String(objectif.targetValue)} {objectif.unit || ""} ({objectif.metricLabel})
              {objectif.deadline
                ? ` · échéance ${new Date(objectif.deadline).toLocaleDateString("fr-FR")}`
                : ""}
            </p>
          </Card>

          {/* Plan pas encore généré */}
          {taches.length === 0 && (
            <Card className="space-y-3 text-center">
              <p className="text-slate-600">
                Prêt·e ? L'IA va construire ton plan d'entraînement jusqu'à l'objectif.
              </p>
              {generatePlan.isPending ? (
                <AiLoader label="Construction de ton plan d'entraînement…" />
              ) : (
                <Button onClick={() => generatePlan.mutate()}>Générer mon plan (IA)</Button>
              )}
              {generatePlan.isError && <ErrorMsg>{generatePlan.error.message}</ErrorMsg>}
            </Card>
          )}

          {/* Parcours + détail de la séance */}
          {taches.length > 0 && (
            <Card className="space-y-5">
              <TrainingPath seances={taches} selectedId={selectedId} onSelect={setSelectedId} />

              {selected && (
                <SeanceDetail
                  seance={selected}
                  isCurrent={selected.id === currentId}
                  isDone={selected.status === "fait"}
                  onComplete={() => completeSeance.mutate(selected)}
                  pending={completeSeance.isPending}
                />
              )}
              {completeSeance.isError && <ErrorMsg>{completeSeance.error.message}</ErrorMsg>}

              <div className="border-t border-slate-100 pt-4">
                <Button
                  variant="success"
                  className="w-full"
                  onClick={() => validate.mutate()}
                  disabled={validate.isPending}
                >
                  {validate.isPending
                    ? "…"
                    : allDone
                      ? "🏆 Valider mon objectif !"
                      : "Valider l'objectif (terminer maintenant)"}
                </Button>
                {validate.isError && <ErrorMsg>{validate.error.message}</ErrorMsg>}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Historique des objectifs terminés */}
      <ObjectifsHistory objectifs={data.objectifs} />
    </div>
  );
}

function SeanceDetail({ seance, isCurrent, isDone, onComplete, pending }) {
  const meta = categoryMeta(seance.category);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Badge color={meta.badge}>
          {meta.emoji} {meta.label}
        </Badge>
        {seance.estDurationMin != null && (
          <span className="text-xs text-slate-400">≈ {seance.estDurationMin} min</span>
        )}
        {isDone && <Badge color="green">Fait ✓</Badge>}
      </div>
      <p className="font-semibold text-slate-800">
        {seance.orderIndex}. {seance.title}
      </p>
      {seance.description && <p className="mt-1 text-sm text-slate-600">{seance.description}</p>}

      <div className="mt-3">
        {isDone ? (
          <p className="text-sm font-medium text-emerald-700">Séance terminée 🎉</p>
        ) : isCurrent ? (
          <Button onClick={onComplete} disabled={pending}>
            {pending ? "Enregistrement…" : "J'ai fait cette séance ✅"}
          </Button>
        ) : (
          <p className="text-sm text-slate-400">Termine d'abord les séances précédentes 🔒</p>
        )}
      </div>
    </div>
  );
}

function ObjectifsHistory({ objectifs }) {
  const termines = (objectifs || []).filter((o) => o.status === "valide");
  if (termines.length === 0) return null;
  return (
    <Card>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        Objectifs atteints
      </h3>
      <ul className="space-y-2">
        {termines.map((o) => (
          <li key={o.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-700">🏆 {o.title}</span>
            <span className="text-slate-400">
              {o.validatedAt ? new Date(o.validatedAt).toLocaleDateString("fr-FR") : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
