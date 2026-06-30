// Tableau de bord multi-domaine :
//  - jusqu'à 3 domaines par utilisateur
//  - objectif actif par domaine
//  - plan IA, complétion d'étapes, XP et validation
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AI_TIMEOUT_MS } from "../api/client";
import { Card, Button, Badge, Spinner, AiLoader, ErrorMsg, Field, Input, Textarea } from "../components/ui";
import { XpBar } from "../components/bars";
import { categoryMeta } from "../lib/categories";
import TrainingPath from "../components/TrainingPath";
import CreateObjectif from "../components/CreateRunningObjectif";
import RewardModal from "../components/RewardModal";

const MAX_DOMAINES = 3;
const diffColor = { facile: "green", moyen: "amber", difficile: "violet" };

export default function Dashboard() {
  const qc = useQueryClient();
  const [reward, setReward] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedDomainId, setSelectedDomainId] = useState(() => {
    const saved = localStorage.getItem("se_selected_domain_id");
    return saved ? Number(saved) : null;
  });

  const domainesQuery = useQuery({
    queryKey: ["domaines"],
    queryFn: () => api("/domaines"),
  });

  const domaines = useMemo(() => domainesQuery.data || [], [domainesQuery.data]);
  const selectedDomain = domaines.find((d) => d.id === selectedDomainId) || domaines[0] || null;
  const activeDomainId = selectedDomain?.id || null;

  useEffect(() => {
    if (!domaines.length) {
      setSelectedDomainId(null);
      localStorage.removeItem("se_selected_domain_id");
      return;
    }
    if (!selectedDomainId || !domaines.some((d) => d.id === selectedDomainId)) {
      setSelectedDomainId(domaines[0].id);
    }
  }, [domaines, selectedDomainId]);

  useEffect(() => {
    if (activeDomainId) localStorage.setItem("se_selected_domain_id", String(activeDomainId));
  }, [activeDomainId]);

  const progressQuery = useQuery({
    queryKey: ["domaine-progress", activeDomainId],
    queryFn: () => api(`/domaines/${activeDomainId}/progression`),
    enabled: !!activeDomainId,
  });

  const createDomain = useMutation({
    mutationFn: (body) => api("/domaines", { method: "POST", body }),
    onSuccess: (domaine) => {
      setSelectedDomainId(domaine.id);
      qc.invalidateQueries({ queryKey: ["domaines"] });
    },
  });

  const deleteDomain = useMutation({
    mutationFn: (id) => api(`/domaines/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelectedDomainId(null);
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["domaines"] });
    },
  });

  const data = progressQuery.data;
  const objectif = data?.objectifActif || null;
  const taches = useMemo(() => objectif?.taches || [], [objectif]);
  const currentId = useMemo(() => taches.find((t) => t.status !== "fait")?.id ?? null, [taches]);

  // Sélectionne par défaut l'étape du jour.
  useEffect(() => {
    if (taches.length && !taches.some((t) => t.id === selectedId)) {
      setSelectedId(currentId ?? taches[0].id);
    }
  }, [taches, currentId, selectedId]);

  const generatePlan = useMutation({
    mutationFn: () =>
      api(`/objectifs/${objectif.id}/taches/generate`, { method: "POST", timeoutMs: AI_TIMEOUT_MS }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domaine-progress", activeDomainId] }),
  });

  // Terminer une étape : le backend logge la session, calcule l'XP et marque la tâche faite.
  const completeStep = useMutation({
    mutationFn: (step) => api(`/taches/${step.id}/complete`, { method: "POST" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["domaines"] });
      qc.invalidateQueries({ queryKey: ["domaine-progress", activeDomainId] });
      setReward({
        title: "Étape terminée ! 💪",
        xpEarned: res.xpEarned,
        leveledUp: res.leveledUp,
        newLevels: res.newLevels,
      });
    },
  });

  const validate = useMutation({
    mutationFn: () => api(`/objectifs/${objectif.id}/validate`, { method: "PATCH" }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["domaines"] });
      qc.invalidateQueries({ queryKey: ["domaine-progress", activeDomainId] });
      setSelectedId(null);
      setReward({
        title: "Objectif atteint ! 🏆",
        xpEarned: res.xpEarned,
        leveledUp: res.leveledUp,
        newLevels: res.newLevels,
      });
    },
  });

  if (domainesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Spinner /> Chargement…
      </div>
    );
  }

  const domaine = data?.domaine || selectedDomain;
  const selected = taches.find((t) => t.id === selectedId) || null;
  const allDone = taches.length > 0 && taches.every((t) => t.status === "fait");

  return (
    <div className="space-y-6">
      <RewardModal reward={reward} onClose={() => setReward(null)} />

      <DomainSwitcher
        domaines={domaines}
        selectedDomainId={activeDomainId}
        onSelect={setSelectedDomainId}
        createDomain={createDomain}
      />

      {domainesQuery.isError && <ErrorMsg>{domainesQuery.error.message}</ErrorMsg>}
      {progressQuery.isError && <ErrorMsg>{progressQuery.error.message}</ErrorMsg>}

      {!domaine && (
        <Card>
          <p className="text-sm text-slate-500">Crée ton premier domaine pour commencer.</p>
        </Card>
      )}

      {domaine && progressQuery.isLoading && (
        <div className="flex items-center gap-2 text-slate-500">
          <Spinner /> Chargement du domaine…
        </div>
      )}

      {domaine && !progressQuery.isLoading && (
        <>
          {/* En-tête domaine */}
          <Card className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-extrabold text-slate-800">{domaine.name}</h1>
                {domaine.description && <p className="text-sm text-slate-500">{domaine.description}</p>}
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm(`Supprimer le domaine "${domaine.name}" et ses objectifs ?`)) {
                    deleteDomain.mutate(domaine.id);
                  }
                }}
                disabled={deleteDomain.isPending}
              >
                Supprimer
              </Button>
            </div>
            <XpBar totalXp={domaine.totalXp} xpToNextLevel={domaine.xpToNextLevel} level={domaine.level} />
            <p className="text-xs text-slate-400">
              {Math.round((domaine.totalMinutes / 60) * 10) / 10} h pratiquées dans ce domaine
            </p>
            {deleteDomain.isError && <ErrorMsg>{deleteDomain.error.message}</ErrorMsg>}
          </Card>

          {/* Pas d'objectif actif → création guidée */}
          {!objectif && <CreateObjectif domaine={domaine} />}

          {/* Objectif actif */}
          {objectif && (
            <>
          <Card className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={diffColor[objectif.difficulty]}>{objectif.difficulty}</Badge>
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
                Prêt·e ? L'IA va construire ton plan d'action jusqu'à l'objectif.
              </p>
              {generatePlan.isPending ? (
                <AiLoader label="Construction de ton plan d'action…" />
              ) : (
                <Button onClick={() => generatePlan.mutate()}>Générer mon plan (IA)</Button>
              )}
              {generatePlan.isError && <ErrorMsg>{generatePlan.error.message}</ErrorMsg>}
            </Card>
          )}

          {/* Parcours + détail de l'étape */}
          {taches.length > 0 && (
            <Card className="space-y-5">
              <TrainingPath seances={taches} selectedId={selectedId} onSelect={setSelectedId} />

              {selected && (
                <SeanceDetail
                  seance={selected}
                  isCurrent={selected.id === currentId}
                  isDone={selected.status === "fait"}
                  onComplete={() => completeStep.mutate(selected)}
                  pending={completeStep.isPending}
                />
              )}
              {completeStep.isError && <ErrorMsg>{completeStep.error.message}</ErrorMsg>}

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
          <ObjectifsHistory objectifs={data?.objectifs || []} />
        </>
      )}
    </div>
  );
}

function DomainSwitcher({ domaines, selectedDomainId, onSelect, createDomain }) {
  const canCreate = domaines.length < MAX_DOMAINES;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Mes domaines</h2>
          <p className="text-sm text-slate-500">{domaines.length} / {MAX_DOMAINES} domaines suivis</p>
        </div>
        {!canCreate && <Badge color="amber">Limite atteinte</Badge>}
      </div>

      {domaines.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {domaines.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id)}
              className={`rounded-xl border p-3 text-left transition ${
                d.id === selectedDomainId
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300"
              }`}
            >
              <div className="font-semibold text-slate-800">{d.name}</div>
              <div className="mt-1 text-xs text-slate-500">Niveau {d.level} · {d.totalXp}/{d.xpToNextLevel} XP</div>
            </button>
          ))}
        </div>
      )}

      {canCreate ? (
        <DomainCreateForm mutation={createDomain} first={domaines.length === 0} />
      ) : (
        <p className="text-sm text-slate-500">Supprime un domaine si tu veux en suivre un autre.</p>
      )}
    </Card>
  );
}

function DomainCreateForm({ mutation, first }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    mutation.mutate(
      { name, description: description || null },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
        },
      }
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div>
        <h3 className="font-semibold text-slate-700">
          {first ? "Créer ton premier domaine" : "Ajouter un domaine"}
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Code, course, guitare…"
            required
            maxLength={100}
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ce que tu veux améliorer"
            rows={1}
            maxLength={1000}
          />
        </Field>
      </div>
      {mutation.isError && <ErrorMsg>{mutation.error.message}</ErrorMsg>}
      <Button type="submit" disabled={!name.trim() || mutation.isPending} className="w-full sm:w-fit">
        {mutation.isPending ? "Création…" : "Créer le domaine"}
      </Button>
    </form>
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
          <p className="text-sm font-medium text-emerald-700">Étape terminée 🎉</p>
        ) : isCurrent ? (
          <Button onClick={onComplete} disabled={pending}>
            {pending ? "Enregistrement…" : "J'ai terminé cette étape ✅"}
          </Button>
        ) : (
          <p className="text-sm text-slate-400">Termine d'abord les étapes précédentes 🔒</p>
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
