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

function formatHours(minutes = 0) {
  return Math.round((minutes / 60) * 10) / 10;
}

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
  const totalMinutes = domaines.reduce((sum, d) => sum + d.totalMinutes, 0);
  const totalObjectives = domaines.reduce((sum, d) => sum + (d.objectifs?.length || 0), 0);
  const activeObjectives = domaines.reduce(
    (sum, d) => sum + (d.objectifs || []).filter((o) => o.status === "en_cours").length,
    0
  );

  return (
    <div className="space-y-6">
      <RewardModal reward={reward} onClose={() => setReward(null)} />

      <MissionHeader
        domaineCount={domaines.length}
        totalHours={formatHours(totalMinutes)}
        activeObjectives={activeObjectives}
        totalObjectives={totalObjectives}
      />

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
          <Card className="relative overflow-hidden border-slate-900/10 bg-white/90">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#15615f] via-[#356c9f] to-[#f26a4f]" />
            <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.18em] text-[#356c9f]">Domaine actif</span>
                <h1 className="mt-1 text-2xl font-black text-slate-900">{domaine.name}</h1>
                {domaine.description && <p className="text-sm text-slate-500">{domaine.description}</p>}
              </div>
              <Button
                variant="danger"
                className="px-3 py-2"
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
              {formatHours(domaine.totalMinutes)} h pratiquées dans ce domaine
            </p>
            {deleteDomain.isError && <ErrorMsg>{deleteDomain.error.message}</ErrorMsg>}
            </div>
          </Card>

          {/* Pas d'objectif actif → création guidée */}
          {!objectif && <CreateObjectif domaine={domaine} />}

          {/* Objectif actif */}
          {objectif && (
            <>
          <Card className="space-y-3 border-slate-900/10 bg-[#172126] text-white">
            <div className="flex flex-wrap items-center gap-2">
              <Badge color={diffColor[objectif.difficulty]}>{objectif.difficulty}</Badge>
              {objectif.niveau && <Badge>{objectif.niveau}</Badge>}
            </div>
            <h2 className="text-xl font-black">{objectif.title}</h2>
            <p className="text-sm text-slate-300">
              Cible : {String(objectif.targetValue)} {objectif.unit || ""} ({objectif.metricLabel})
              {objectif.deadline
                ? ` · échéance ${new Date(objectif.deadline).toLocaleDateString("fr-FR")}`
                : ""}
            </p>
          </Card>

          {/* Plan pas encore généré */}
          {taches.length === 0 && (
            <Card className="space-y-4 border-dashed border-[#356c9f]/35 bg-[#356c9f]/10 text-center">
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
            <Card className="space-y-5 border-slate-900/10 bg-white/90">
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

function MissionHeader({ domaineCount, totalHours, activeObjectives, totalObjectives }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-900/10 bg-[#172126] text-white shadow-2xl shadow-slate-900/20">
      <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
        <div>
          <div className="mb-3 inline-flex rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#f0c66b]">
            Atelier de progression
          </div>
          <h1 className="max-w-2xl text-3xl font-black leading-tight md:text-4xl">
            Organise tes domaines, avance étape par étape.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
            Chaque domaine a son objectif actif, son plan IA et son propre niveau. Tu gardes le rythme sans mélanger les progressions.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 self-end">
          <StatTile label="Domaines" value={`${domaineCount}/3`} tone="teal" />
          <StatTile label="Heures" value={totalHours} tone="gold" />
          <StatTile label="Objectifs" value={`${activeObjectives}/${totalObjectives}`} tone="coral" />
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value, tone }) {
  const tones = {
    teal: "border-[#53b6ae]/25 bg-[#53b6ae]/15 text-[#91f0e6]",
    gold: "border-[#f0c66b]/25 bg-[#f0c66b]/15 text-[#ffe2a0]",
    coral: "border-[#f26a4f]/25 bg-[#f26a4f]/15 text-[#ffb3a3]",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-xl font-black">{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{label}</div>
    </div>
  );
}

function DomainSwitcher({ domaines, selectedDomainId, onSelect, createDomain }) {
  const canCreate = domaines.length < MAX_DOMAINES;

  return (
    <Card className="space-y-4 border-slate-900/10 bg-white/80">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Mes domaines</h2>
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
              className={`group rounded-lg border p-3 text-left transition hover:-translate-y-0.5 ${
                d.id === selectedDomainId
                  ? "border-[#15615f] bg-[#15615f]/10 shadow-lg shadow-teal-900/10"
                  : "border-slate-200 bg-slate-50/80 hover:border-[#356c9f]/35 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-black text-slate-900">{d.name}</div>
                <span className={`h-2.5 w-2.5 rounded-full ${d.id === selectedDomainId ? "bg-[#15615f]" : "bg-slate-300 group-hover:bg-[#356c9f]"}`} />
              </div>
              <div className="mt-2 text-xs font-medium text-slate-500">Niveau {d.level} · {d.totalXp}/{d.xpToNextLevel} XP</div>
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
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-3">
      <div>
        <h3 className="font-black text-slate-800">
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
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge color={meta.badge}>
          {meta.emoji} {meta.label}
        </Badge>
        {seance.estDurationMin != null && (
          <span className="rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500">≈ {seance.estDurationMin} min</span>
        )}
        {isDone && <Badge color="green">Fait ✓</Badge>}
      </div>
      <p className="text-lg font-black text-slate-900">
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
    <Card className="border-slate-900/10 bg-white/80">
      <h3 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400">
        Objectifs atteints
      </h3>
      <ul className="space-y-2">
        {termines.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/75 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">🏆 {o.title}</span>
            <span className="text-slate-400">
              {o.validatedAt ? new Date(o.validatedAt).toLocaleDateString("fr-FR") : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
