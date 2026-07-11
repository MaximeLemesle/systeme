// Tableau de bord du parcours running : objectif, plan, performances et XP.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card, Button, Badge, Spinner, ErrorMsg, Field, Input, Select } from "../components/ui";
import { XpBar } from "../components/bars";
import { categoryMeta } from "../lib/categories";
import TrainingPath from "../components/TrainingPath";
import CreateObjectif from "../components/CreateRunningObjectif";
import RewardModal from "../components/RewardModal";
import { formatDuration } from "../lib/time";

const diffColor = { facile: "green", moyen: "amber", difficile: "violet" };

function formatHours(minutes = 0) {
  return Math.round((minutes / 60) * 10) / 10;
}

export default function Dashboard() {
  const qc = useQueryClient();
  const [reward, setReward] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const domainesQuery = useQuery({
    queryKey: ["domaines"],
    queryFn: () => api("/domaines"),
  });

  const domaines = useMemo(() => domainesQuery.data || [], [domainesQuery.data]);
  const selectedDomain = domaines[0] || null;
  const activeDomainId = selectedDomain?.id || null;

  const progressQuery = useQuery({
    queryKey: ["domaine-progress", activeDomainId],
    queryFn: () => api(`/domaines/${activeDomainId}/progression`),
    enabled: !!activeDomainId,
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
      api(`/objectifs/${objectif.id}/taches/generate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domaine-progress", activeDomainId] }),
  });

  // Terminer une étape : le backend logge la session, calcule l'XP et marque la tâche faite.
  const completeStep = useMutation({
    mutationFn: ({ step, performance }) =>
      api(`/taches/${step.id}/complete`, { method: "POST", body: performance }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["domaines"] });
      qc.invalidateQueries({ queryKey: ["domaine-progress", activeDomainId] });
      setReward({
        title: "Checkpoint débloqué !",
        xpEarned: res.xpEarned,
        leveledUp: res.leveledUp,
        newLevels: res.newLevels,
        predictionSeconds: res.predictionSeconds,
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
      <div className="flex items-center gap-2 font-bold text-[#8a6f5f]">
        <Spinner /> Chargement du domaine…
      </div>
    );
  }

  const domaine = data?.domaine || selectedDomain;
  const selected = taches.find((t) => t.id === selectedId) || null;
  const allDone = taches.length > 0 && taches.every((t) => t.status === "fait");
  const totalObjectives = selectedDomain?.objectifs?.length || 0;

  return (
    <div className="space-y-6">
      <RewardModal reward={reward} onClose={() => setReward(null)} />

      <MissionHeader
        totalHours={formatHours(selectedDomain?.totalMinutes)}
        level={selectedDomain?.level || 1}
        totalObjectives={totalObjectives}
      />

      {domainesQuery.isError && <ErrorMsg>{domainesQuery.error.message}</ErrorMsg>}
      {progressQuery.isError && <ErrorMsg>{progressQuery.error.message}</ErrorMsg>}

      {/* Guide d'avancement : où en est le joueur dans le cycle de jeu */}
      {(!domaine || !progressQuery.isLoading) && (
        <QuestStepper
          hasObjectif={!!objectif}
          hasPlan={taches.length > 0}
          allDone={allDone}
        />
      )}

      {!domaine && (
        <Card>
          <ErrorMsg>Le domaine Course à pied associé à ce compte est introuvable.</ErrorMsg>
        </Card>
      )}

      {domaine && progressQuery.isLoading && (
        <div className="flex items-center gap-2 font-bold text-[#8a6f5f]">
          <Spinner /> Chargement du domaine…
        </div>
      )}

      {domaine && !progressQuery.isLoading && (
        <>
          {/* En-tête domaine : piste active + jauges */}
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            {/* Carte piste active avec coin biseauté + triangle doré */}
            <div
              className="relative border border-[#e8d9c8] bg-white p-6"
              style={{ clipPath: "polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,0 100%)" }}
            >
              <div
                className="absolute right-0 top-0 h-[22px] w-[22px] bg-[#d9a441]"
                style={{ clipPath: "polygon(100% 0,0 0,100% 100%)" }}
              />
              <div className="font-display text-[13px] uppercase tracking-[0.12em] text-[#c8532f]">Piste active</div>
              <h1 className="mb-4 font-display text-2xl uppercase text-[#2b211d]">{domaine.name}</h1>
              {domaine.description && (
                <p className="mb-4 max-w-2xl text-sm font-medium text-[#8a6f5f]">{domaine.description}</p>
              )}
              <XpBar totalXp={domaine.totalXp} xpToNextLevel={domaine.xpToNextLevel} level={domaine.level} />
            </div>
            <div className="flex flex-col gap-3.5">
              <div className="border border-[#e8d9c8] border-l-[5px] border-l-[#2b211d] bg-white px-5 py-4">
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#8a6f5f]">Chrono cumulé</div>
                <div className="font-display text-2xl uppercase text-[#2b211d]">{formatHours(domaine.totalMinutes)} h</div>
                <div className="text-xs text-[#8a6f5f]">sur ta piste running</div>
              </div>
              <div className="border border-[#d9a441] border-l-[5px] border-l-[#d9a441] bg-[#fdf1e3] px-5 py-4">
                <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#a8791f]">Rang actuel</div>
                <div className="font-display text-2xl uppercase text-[#2b211d]">Niv. {domaine.level}</div>
                <div className="text-xs text-[#a8791f]">prochaine montée avec l'XP</div>
              </div>
            </div>
          </div>

          {/* Pas d'objectif actif → création guidée */}
          {!objectif && <CreateObjectif domaine={domaine} />}

          {/* Objectif actif */}
          {objectif && (
            <>
          {/* Quête active : carte façon dossard perforé */}
          <div className="flex border border-[#e8d9c8] bg-white">
            <div className="relative flex w-16 shrink-0 items-center justify-center bg-[#1c1410]">
              <span
                className="font-display text-[15px] uppercase tracking-[0.06em] text-[#ffd98a]"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                Quête active
              </span>
              <span className="absolute left-1/2 top-3 h-2 w-2 -translate-x-1/2 rounded-full bg-[#faf5ee]" />
              <span className="absolute bottom-3 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#faf5ee]" />
            </div>
            <div className="flex-1 p-6">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge color={diffColor[objectif.difficulty]}>Quête {objectif.difficulty}</Badge>
                {objectif.niveau && <Badge>{objectif.niveau}</Badge>}
              </div>
              <h2 className="mb-4 font-display text-2xl uppercase leading-tight text-[#2b211d]">{objectif.title}</h2>
              <div className="grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#8a6f5f]">Cible</div>
                  <div className="font-bold text-[#2b211d]">
                    {objectif.objectiveType === "chrono" && objectif.targetTimeSeconds
                      ? formatDuration(objectif.targetTimeSeconds)
                      : `${String(objectif.targetValue)} ${objectif.unit || ""}`} · {objectif.metricLabel}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#8a6f5f]">Prédiction</div>
                  <div className="font-bold text-[#2b211d]">{formatDuration(objectif.predictionSeconds)}</div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#8a6f5f]">Échéance</div>
                  <div className="font-bold text-[#2b211d]">
                    {objectif.deadline ? new Date(objectif.deadline).toLocaleDateString("fr-FR") : "Libre"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Plan pas encore généré */}
          {taches.length === 0 && (
            <Card className="space-y-4 border-dashed border-[#3477a8]/35 bg-[#e9f3fb]/85 text-center">
              <p className="font-semibold text-[#31526d]">
                Ton plan est prêt à être calculé à partir du catalogue de séances Running Club.
              </p>
              <Button onClick={() => generatePlan.mutate()} disabled={generatePlan.isPending}>
                {generatePlan.isPending ? "Calcul du plan…" : "Générer le plan"}
              </Button>
              {generatePlan.isError && <ErrorMsg>{generatePlan.error.message}</ErrorMsg>}
            </Card>
          )}

          {/* Parcours + détail de l'étape */}
          {taches.length > 0 && (
            <Card className="space-y-5 border-[#2b211d]/15 bg-[#faf5ee]/95">
              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <TrainingPath seances={taches} selectedId={selectedId} onSelect={setSelectedId} />

                <div className="space-y-3 lg:sticky lg:top-5">
                  {selected && (
                    <SeanceDetail
                      key={selected.id}
                      seance={selected}
                      isCurrent={selected.id === currentId}
                      isDone={selected.status === "fait"}
                      onComplete={(performance) => completeStep.mutate({ step: selected, performance })}
                      pending={completeStep.isPending}
                    />
                  )}
                  {completeStep.isError && <ErrorMsg>{completeStep.error.message}</ErrorMsg>}
                </div>
              </div>

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

function MissionHeader({ totalHours, level, totalObjectives }) {
  return (
    <section
      className="relative overflow-hidden text-white shadow-2xl shadow-[#5a2314]/25"
      style={{
        background: "linear-gradient(120deg,#b5482f,#8a3320 70%)",
        clipPath: "polygon(0 0,100% 0,100% 100%,28px 100%,0 calc(100% - 28px))",
      }}
    >
      {/* Trame diagonale */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 34px, rgba(255,255,255,0.05) 34px 36px)",
        }}
      />
      <div className="relative flex flex-wrap justify-between gap-7 p-9">
        <div className="max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 font-display text-[13px] uppercase tracking-[0.12em] text-[#ffd98a]">
            <span className="inline-block h-0.5 w-[22px] bg-[#ffd98a]" /> Carte de campagne
          </div>
          <h1 className="font-display text-4xl uppercase leading-[1.05] tracking-[0.01em] md:text-5xl">
            Chaque séance te rapproche de ta course.
          </h1>
          <p className="mt-3 max-w-lg text-sm font-medium leading-6 text-white/80">
            Suis ton plan, enregistre tes performances et gagne de l&apos;XP à chaque relais.
          </p>
        </div>
        <div className="flex gap-2.5 self-start">
          <StatTile label="Niveau" value={level} tone="gold" />
          <StatTile label="Heures" value={totalHours} tone="white" />
          <StatTile label="Objectifs" value={totalObjectives} tone="coral" />
        </div>
      </div>
    </section>
  );
}

// Tuile stat façon panneau de course : bordure supérieure colorée, chiffre Bebas.
function StatTile({ label, value, tone }) {
  const tones = {
    gold: { border: "#ffd98a", value: "text-white" },
    white: { border: "#ffffff", value: "text-white" },
    coral: { border: "#ffb27a", value: "text-[#ffb27a]" },
  };
  const t = tones[tone] || tones.gold;
  return (
    <div className="min-w-[92px] bg-black/[0.18] px-5 py-4" style={{ borderTop: `3px solid ${t.border}` }}>
      <div className={`font-display text-3xl leading-none ${t.value}`}>{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/70">{label}</div>
    </div>
  );
}

// Guide d'avancement : les 4 étapes du cycle de jeu, avec l'étape courante mise en avant.
function QuestStepper({ hasObjectif, hasPlan, allDone }) {
  const steps = [
    { icon: "★", label: "Définis ton objectif", done: hasObjectif },
    { icon: "🗺", label: "Génère ton plan", done: hasPlan },
    { icon: "🏆", label: allDone ? "Valide ton objectif" : "Complète les séances", done: false },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="relative py-5">
      {/* Ligne pointillée dorée reliant les checkpoints */}
      <div
        className="absolute left-[16%] right-[16%] top-[42px] h-[3px]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg,#d9a441 0 16px, transparent 16px 30px)",
        }}
      />
      <div className="relative flex justify-between">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <div key={s.label} className="flex w-1/3 flex-col items-center gap-2.5">
              <span
                className={`z-[1] flex items-center justify-center rounded-full border-[3px] border-[#f3ece1] ${
                  s.done
                    ? "h-11 w-11 bg-[#3f8f5a] font-display text-xl text-white"
                    : isCurrent
                      ? "pulse-ring h-[52px] w-[52px] bg-[#d9a441] text-[22px] text-[#3a2600]"
                      : "h-11 w-11 bg-[#e8d9c8] text-lg text-[#8a6f5f]"
                }`}
              >
                {s.done ? "✓" : s.icon}
              </span>
              <div
                className={`text-center text-[11px] font-bold uppercase leading-tight tracking-[0.05em] ${
                  isCurrent ? "font-extrabold text-[#a8401f]" : "text-[#8a6f5f]"
                }`}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeanceDetail({ seance, isCurrent, isDone, onComplete, pending }) {
  const meta = categoryMeta(seance.category);
  const [durationMinutes, setDurationMinutes] = useState(seance.estDurationMin || 30);
  const [distanceKm, setDistanceKm] = useState("");
  const [timeMinutes, setTimeMinutes] = useState("");
  const [selfRating, setSelfRating] = useState("3");

  function submit(event) {
    event.preventDefault();
    const performance = {
      durationMinutes: Number(durationMinutes),
      selfRating: Number(selfRating),
    };
    if (distanceKm !== "" && timeMinutes !== "") {
      performance.distanceKm = Number(distanceKm);
      performance.timeSeconds = Math.round(Number(timeMinutes) * 60);
    }
    onComplete(performance);
  }

  return (
    <div className={`border-2 p-5 ${
      isDone
        ? "border-[#c8532f]/25 bg-[#c8532f]/10"
        : isCurrent
          ? "border-[#d9a441] bg-white"
          : "border-[#2b211d]/12 bg-[#faf5ee]/70"
    }`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={meta.badge}>
            {meta.emoji} {meta.label}
          </Badge>
          {seance.estDurationMin != null && (
            <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-black text-[#8a6f5f]">≈ {seance.estDurationMin} min</span>
          )}
          {seance.intensityPercent != null && (
            <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-black text-[#8a6f5f]">{seance.intensityPercent} % VMA</span>
          )}
          {isDone && <Badge color="green">Checkpoint validé</Badge>}
        </div>
        <span className="rounded-md border border-[#2b211d]/10 bg-white/70 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#8a6f5f]">
          Étape {seance.orderIndex}
        </span>
      </div>
      <p className="font-display text-2xl uppercase text-[#2b211d]">
        {seance.title}
      </p>
      {seance.description && <p className="mt-1 text-sm font-medium text-[#8a6f5f]">{seance.description}</p>}

      <div className="mt-4">
        {isDone ? (
          <p className="text-sm font-black text-[#c8532f]">XP déjà gagnée sur ce checkpoint.</p>
        ) : isCurrent ? (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Durée (min)">
                <Input type="number" min="1" max="240" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} required />
              </Field>
              <Field label="Distance (km)">
                <Input type="number" min="0.1" max="100" step="0.01" value={distanceKm} onChange={(event) => setDistanceKm(event.target.value)} placeholder="Optionnel" />
              </Field>
              <Field label="Temps couru (min)">
                <Input type="number" min="0.1" max="1440" step="0.01" value={timeMinutes} onChange={(event) => setTimeMinutes(event.target.value)} placeholder="Optionnel" />
              </Field>
              <Field label="Ressenti">
                <Select value={selfRating} onChange={(event) => setSelfRating(event.target.value)}>
                  <option value="1">1 - Très difficile</option>
                  <option value="2">2 - Difficile</option>
                  <option value="3">3 - Adapté</option>
                  <option value="4">4 - Facile</option>
                  <option value="5">5 - Très facile</option>
                </Select>
              </Field>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full bg-[#1c1410] py-3.5 text-center font-display text-[17px] uppercase tracking-[0.04em] text-white transition hover:bg-[#2b211d] disabled:opacity-60"
              style={{ clipPath: "polygon(14px 0,100% 0,100% 100%,0 100%,0 14px)" }}
            >
              {pending ? "Enregistrement…" : "Valider cette séance"}
            </button>
          </form>
        ) : (
          <p className="text-sm font-bold text-[#a89787]">Checkpoint verrouillé jusqu'aux étapes précédentes.</p>
        )}
      </div>
    </div>
  );
}

function ObjectifsHistory({ objectifs }) {
  const termines = (objectifs || []).filter((o) => o.status === "valide");
  if (termines.length === 0) return null;
  return (
    <Card className="border-[#2b211d]/15 bg-[#faf5ee]/90">
      <h3 className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#6b4a1a]">
        Trophées débloqués
      </h3>
      <ul className="space-y-2">
        {termines.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border-2 border-[#d9a441]/20 bg-[#faf0df] px-3 py-2 text-sm">
            <span className="font-black text-[#2b211d]">🏆 {o.title}</span>
            <span className="font-bold text-[#8a6f5f]">
              {o.validatedAt ? new Date(o.validatedAt).toLocaleDateString("fr-FR") : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
