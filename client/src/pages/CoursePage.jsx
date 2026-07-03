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
        title: "Checkpoint débloqué !",
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
        title: "Quête accomplie !",
        xpEarned: res.xpEarned,
        leveledUp: res.leveledUp,
        newLevels: res.newLevels,
      });
    },
  });

  if (domainesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 font-bold text-[#6c5a3a]">
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

      {/* Guide d'avancement : où en est le joueur dans le cycle de jeu */}
      {(!domaine || !progressQuery.isLoading) && (
        <QuestStepper
          hasDomaine={!!domaine}
          hasObjectif={!!objectif}
          hasPlan={taches.length > 0}
          allDone={allDone}
        />
      )}

      {!domaine && (
        <Card>
          <p className="text-sm font-semibold text-[#7d705e]">Crée ton premier monde pour lancer la progression.</p>
        </Card>
      )}

      {domaine && progressQuery.isLoading && (
        <div className="flex items-center gap-2 font-bold text-[#6c5a3a]">
          <Spinner /> Chargement du domaine…
        </div>
      )}

      {domaine && !progressQuery.isLoading && (
        <>
          {/* En-tête domaine */}
          <Card className="relative overflow-hidden border-[#3d2d18]/15 bg-[#fffaf0]/95">
            <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#1f6f5f] via-[#3477a8] to-[#d95f45]" />
            <div className="grid gap-5 pt-2 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-[#3477a8]">Monde actif</span>
                    <h1 className="mt-1 text-3xl font-black text-[#18212a]">{domaine.name}</h1>
                    {domaine.description && <p className="max-w-2xl text-sm font-medium text-[#7d705e]">{domaine.description}</p>}
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
                {deleteDomain.isError && <ErrorMsg>{deleteDomain.error.message}</ErrorMsg>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-lg border-2 border-[#1f6f5f]/20 bg-[#1f6f5f]/10 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[#1f6f5f]">Temps exploré</div>
                  <div className="mt-1 text-3xl font-black text-[#18212a]">{formatHours(domaine.totalMinutes)} h</div>
                  <div className="text-xs font-bold text-[#7d705e]">dans ce monde</div>
                </div>
                <div className="rounded-lg border-2 border-[#d89b2b]/25 bg-[#fff3cf] p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8b5d12]">Rang actuel</div>
                  <div className="mt-1 text-3xl font-black text-[#18212a]">Niv. {domaine.level}</div>
                  <div className="text-xs font-bold text-[#7d705e]">prochaine montée avec l'XP</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Pas d'objectif actif → création guidée */}
          {!objectif && <CreateObjectif domaine={domaine} />}

          {/* Objectif actif */}
          {objectif && (
            <>
          <Card className="quest-shine space-y-4 overflow-hidden border-[#172126]/20 bg-[#172126] text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={diffColor[objectif.difficulty]}>Quête {objectif.difficulty}</Badge>
                {objectif.niveau && <Badge>{objectif.niveau}</Badge>}
              </div>
              <span className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#f0c66b]">
                Quête active
              </span>
            </div>
            <h2 className="text-2xl font-black leading-tight">{objectif.title}</h2>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Cible</div>
                <div className="mt-1 font-black text-white">
                  {String(objectif.targetValue)} {objectif.unit || ""} · {objectif.metricLabel}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 p-3">
                <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Échéance</div>
                <div className="mt-1 font-black text-white">
                  {objectif.deadline ? new Date(objectif.deadline).toLocaleDateString("fr-FR") : "Libre"}
                </div>
              </div>
            </div>
          </Card>

          {/* Plan pas encore généré */}
          {taches.length === 0 && (
            <Card className="space-y-4 border-dashed border-[#3477a8]/35 bg-[#e9f3fb]/85 text-center">
              <p className="font-semibold text-[#31526d]">
                La route de quête n'est pas encore tracée. L'IA peut générer les checkpoints jusqu'à l'objectif.
              </p>
              {generatePlan.isPending ? (
                <AiLoader label="Construction de ton plan d'action…" />
              ) : (
                <Button onClick={() => generatePlan.mutate()}>Tracer la route (IA)</Button>
              )}
              {generatePlan.isError && <ErrorMsg>{generatePlan.error.message}</ErrorMsg>}
            </Card>
          )}

          {/* Parcours + détail de l'étape */}
          {taches.length > 0 && (
            <Card className="space-y-5 border-[#3d2d18]/15 bg-[#fffaf0]/95">
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
                      ? "Réclamer la récompense finale"
                      : "Terminer la quête maintenant"}
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
    <section className="game-panel overflow-hidden rounded-lg border-2 border-[#172126]/20 bg-[#172126] text-white shadow-2xl shadow-slate-900/20">
      <div className="grid gap-5 p-5 md:grid-cols-[1.2fr_0.8fr] md:p-6">
        <div>
          <div className="mb-3 inline-flex rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#f0c66b]">
            Carte de campagne
          </div>
          <h1 className="max-w-2xl text-3xl font-black leading-tight md:text-4xl">
            Chaque objectif devient une quête à terminer.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
            Choisis un monde, avance sur les checkpoints, gagne de l'XP et fais monter ton niveau par la pratique.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 self-end">
          <StatTile icon="◆" label="Mondes" value={`${domaineCount}/3`} tone="teal" />
          <StatTile icon="⌁" label="Heures" value={totalHours} tone="gold" />
          <StatTile icon="★" label="Quêtes" value={`${activeObjectives}/${totalObjectives}`} tone="coral" />
        </div>
      </div>
    </section>
  );
}

function StatTile({ icon, label, value, tone }) {
  const tones = {
    teal: "border-[#53b6ae]/25 bg-[#53b6ae]/15 text-[#91f0e6]",
    gold: "border-[#f0c66b]/25 bg-[#f0c66b]/15 text-[#ffe2a0]",
    coral: "border-[#d95f45]/25 bg-[#d95f45]/15 text-[#ffb3a3]",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-sm font-black">
        {icon}
      </div>
      <div className="text-xl font-black">{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">{label}</div>
    </div>
  );
}

// Guide d'avancement : les 4 étapes du cycle de jeu, avec l'étape courante mise en avant.
function QuestStepper({ hasDomaine, hasObjectif, hasPlan, allDone }) {
  const steps = [
    { icon: "◆", label: "Choisis ton monde", done: hasDomaine },
    { icon: "★", label: "Définis ta quête", done: hasObjectif },
    { icon: "🗺", label: "Trace la route (IA)", done: hasPlan },
    { icon: "🏆", label: allDone ? "Réclame ta récompense !" : "Avance vers l'objectif", done: false },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <Card className="border-[#3d2d18]/15 bg-[#fffaf0]/90 p-4">
      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          const cls = s.done
            ? "border-[#1f6f5f]/30 bg-[#1f6f5f]/10 text-[#1f6f5f]"
            : isCurrent
              ? "border-[#d89b2b] bg-[#fff3cf] text-[#7f5513] shadow-md shadow-amber-900/10"
              : "border-[#3d2d18]/10 bg-white/60 text-[#9a8d79]";
          return (
            <li key={s.label} className={`flex items-center gap-2.5 rounded-lg border-2 p-2.5 transition ${cls}`}>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                  s.done ? "bg-[#1f6f5f] text-white" : isCurrent ? "bg-[#d89b2b] text-[#2b2114]" : "bg-[#efe4ce]"
                }`}
              >
                {s.done ? "✓" : s.icon}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">Étape {i + 1}</div>
                <div className="truncate text-xs font-black">{s.label}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function DomainSwitcher({ domaines, selectedDomainId, onSelect, createDomain }) {
  const canCreate = domaines.length < MAX_DOMAINES;

  return (
    <Card className="space-y-4 border-[#3d2d18]/15 bg-[#fffaf0]/90">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#18212a]">Mondes disponibles</h2>
          <p className="text-sm font-medium text-[#7d705e]">{domaines.length} / {MAX_DOMAINES} mondes suivis</p>
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
              className={`group rounded-lg border-2 p-3 text-left transition hover:-translate-y-0.5 ${
                d.id === selectedDomainId
                  ? "border-[#1f6f5f] bg-[#1f6f5f]/10 shadow-lg shadow-emerald-950/10"
                  : "border-[#3d2d18]/12 bg-[#fff8e8]/80 hover:border-[#3477a8]/35 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-black text-[#18212a]">{d.name}</div>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black ${
                  d.id === selectedDomainId ? "bg-[#d89b2b] text-[#2b2114]" : "bg-[#efe4ce] text-[#6c5a3a] group-hover:bg-[#d89b2b]"
                }`}>
                  {d.level}
                </span>
              </div>
              <div className="mt-2 text-xs font-bold text-[#7d705e]">Niveau {d.level} · {d.totalXp}/{d.xpToNextLevel} XP</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ead9b8]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#1f6f5f] to-[#d89b2b]"
                  style={{ width: `${Math.min(100, Math.round((d.totalXp / Math.max(1, d.xpToNextLevel)) * 100))}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      {canCreate ? (
        <DomainCreateForm mutation={createDomain} first={domaines.length === 0} />
      ) : (
        <p className="text-sm font-medium text-[#7d705e]">Supprime un monde si tu veux en suivre un autre.</p>
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
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border-2 border-dashed border-[#3d2d18]/20 bg-[#fff8e8]/80 p-3">
      <div>
        <h3 className="font-black text-[#18212a]">
          {first ? "Créer ton premier monde" : "Ajouter un monde"}
        </h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Code, course, guitare..."
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
        {mutation.isPending ? "Création…" : "Créer le monde"}
      </Button>
    </form>
  );
}

function SeanceDetail({ seance, isCurrent, isDone, onComplete, pending }) {
  const meta = categoryMeta(seance.category);
  return (
    <div className={`rounded-lg border-2 p-4 ${
      isDone
        ? "border-[#1f6f5f]/25 bg-[#1f6f5f]/10"
        : isCurrent
          ? "border-[#d89b2b]/35 bg-[#fff3cf]"
          : "border-[#3d2d18]/12 bg-[#fff8e8]/70"
    }`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={meta.badge}>
            {meta.emoji} {meta.label}
          </Badge>
          {seance.estDurationMin != null && (
            <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-black text-[#7d705e]">≈ {seance.estDurationMin} min</span>
          )}
          {isDone && <Badge color="green">Checkpoint validé</Badge>}
        </div>
        <span className="rounded-md border border-[#3d2d18]/10 bg-white/70 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#6c5a3a]">
          Étape {seance.orderIndex}
        </span>
      </div>
      <p className="text-xl font-black text-[#18212a]">
        {seance.title}
      </p>
      {seance.description && <p className="mt-1 text-sm font-medium text-[#6c5a3a]">{seance.description}</p>}

      <div className="mt-3">
        {isDone ? (
          <p className="text-sm font-black text-[#1f6f5f]">XP déjà gagnée sur ce checkpoint.</p>
        ) : isCurrent ? (
          <Button onClick={onComplete} disabled={pending}>
            {pending ? "Enregistrement…" : "Valider ce checkpoint"}
          </Button>
        ) : (
          <p className="text-sm font-bold text-[#9a8d79]">Checkpoint verrouillé jusqu'aux étapes précédentes.</p>
        )}
      </div>
    </div>
  );
}

function ObjectifsHistory({ objectifs }) {
  const termines = (objectifs || []).filter((o) => o.status === "valide");
  if (termines.length === 0) return null;
  return (
    <Card className="border-[#3d2d18]/15 bg-[#fffaf0]/90">
      <h3 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#8b5d12]">
        Trophées débloqués
      </h3>
      <ul className="space-y-2">
        {termines.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-[#d89b2b]/20 bg-[#fff3cf] px-3 py-2 text-sm">
            <span className="font-black text-[#46351f]">🏆 {o.title}</span>
            <span className="font-bold text-[#8a785e]">
              {o.validatedAt ? new Date(o.validatedAt).toLocaleDateString("fr-FR") : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
