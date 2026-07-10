// Tableau de bord — mono-domaine (course à pied, auto-créé à l'inscription) :
//  - objectif actif, plan déterministe, complétion d'étapes, XP et validation
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AI_TIMEOUT_MS } from "../api/client";
import {
    Card,
    Button,
    Badge,
    Spinner,
    ErrorMsg,
    Field,
    Input,
} from "../components/ui";
import { XpBar } from "../components/bars";
import { templateMeta } from "../lib/templates";
import { parseTime, estimateLabel, targetLabel } from "../lib/predict";
import TrainingPath from "../components/TrainingPath";
import CreateObjectif from "../components/CreateRunningObjectif";
import RewardModal from "../components/RewardModal";

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

    const domaines = useMemo(
        () => domainesQuery.data || [],
        [domainesQuery.data],
    );
    // Mono-domaine : un seul monde "Course à pied", auto-créé à l'inscription.
    const domaineSummary = domaines[0] || null;
    const activeDomainId = domaineSummary?.id || null;

    const progressQuery = useQuery({
        queryKey: ["domaine-progress", activeDomainId],
        queryFn: () => api(`/domaines/${activeDomainId}/progression`),
        enabled: !!activeDomainId,
    });

    const data = progressQuery.data;
    const objectif = data?.objectifActif || null;
    const taches = useMemo(() => objectif?.taches || [], [objectif]);
    const currentId = useMemo(
        () => taches.find((t) => t.status !== "fait")?.id ?? null,
        [taches],
    );

    // Sélectionne par défaut l'étape du jour.
    useEffect(() => {
        if (taches.length && !taches.some((t) => t.id === selectedId)) {
            setSelectedId(currentId ?? taches[0].id);
        }
    }, [taches, currentId, selectedId]);

    const generatePlan = useMutation({
        mutationFn: () =>
            api(`/objectifs/${objectif.id}/taches/generate`, {
                method: "POST",
                timeoutMs: AI_TIMEOUT_MS,
            }),
        onSuccess: () =>
            qc.invalidateQueries({
                queryKey: ["domaine-progress", activeDomainId],
            }),
    });

    // Terminer une étape : le backend logge la session (+ perf réelle éventuelle),
    // calcule l'XP, marque la tâche faite, met à jour la prédiction et recalibre
    // silencieusement les allures des séances restantes.
    const completeStep = useMutation({
        mutationFn: ({ step, perf }) =>
            api(`/taches/${step.id}/complete`, {
                method: "POST",
                body: perf || {},
            }),
        onSuccess: (res) => {
            qc.invalidateQueries({ queryKey: ["domaines"] });
            qc.invalidateQueries({
                queryKey: ["domaine-progress", activeDomainId],
            });
            setReward({
                title: "Séance validée !",
                xpEarned: res.xpEarned,
                leveledUp: res.leveledUp,
                newLevels: res.newLevels,
                prediction: res.prediction,
            });
        },
    });

    const validate = useMutation({
        mutationFn: () =>
            api(`/objectifs/${objectif.id}/validate`, { method: "PATCH" }),
        onSuccess: (res) => {
            qc.invalidateQueries({ queryKey: ["domaines"] });
            qc.invalidateQueries({
                queryKey: ["domaine-progress", activeDomainId],
            });
            setSelectedId(null);
            setReward({
                title: "Objectif accompli !",
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

    const domaine = data?.domaine || domaineSummary;
    const selected = taches.find((t) => t.id === selectedId) || null;
    const allDone =
        taches.length > 0 && taches.every((t) => t.status === "fait");
    const targetReached = !!objectif?.currentValue && (() => {
        const cur = Number(objectif.currentValue);
        const target = Number(objectif.targetValue);
        return objectif.archetype === "chrono" ? cur <= target : cur >= target;
    })();
    const objectifsTermines = (data?.objectifs || []).filter(
        (o) => o.status === "valide",
    ).length;

    return (
        <div className="space-y-6">
            <RewardModal reward={reward} onClose={() => setReward(null)} />

            <MissionHeader
                level={domaine?.level || 1}
                totalHours={formatHours(domaine?.totalMinutes || 0)}
                objectifsTermines={objectifsTermines}
            />

            {domainesQuery.isError && (
                <ErrorMsg>{domainesQuery.error.message}</ErrorMsg>
            )}
            {progressQuery.isError && (
                <ErrorMsg>{progressQuery.error.message}</ErrorMsg>
            )}

            {/* Guide d'avancement : où en est le coureur dans le cycle */}
            {!progressQuery.isLoading && (
                <QuestStepper
                    hasObjectif={!!objectif}
                    hasPlan={taches.length > 0}
                    allDone={allDone}
                />
            )}

            {progressQuery.isLoading && (
                <div className="flex items-center gap-2 font-bold text-[#6c5a3a]">
                    <Spinner /> Chargement du plan…
                </div>
            )}

            {domaine && !progressQuery.isLoading && (
                <>
                    {/* En-tête domaine */}
                    <Card className="relative overflow-hidden border-[#3d2d18]/15 bg-[#fffaf0]/95">
                        <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#1f6f5f] via-[#3477a8] to-[#d95f45]" />
                        <div className="grid gap-5 pt-2 lg:grid-cols-[1fr_360px]">
                            <div className="space-y-4">
                                <div>
                                    <span className="text-xs font-black uppercase tracking-[0.18em] text-[#3477a8]">
                                        Coach course à pied
                                    </span>
                                    <h1 className="mt-1 text-3xl font-black text-[#18212a]">
                                        {domaine.name}
                                    </h1>
                                </div>
                                <XpBar
                                    totalXp={domaine.totalXp}
                                    xpToNextLevel={domaine.xpToNextLevel}
                                    level={domaine.level}
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                <div className="rounded-lg border-2 border-[#1f6f5f]/20 bg-[#1f6f5f]/10 p-4">
                                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#1f6f5f]">
                                        Temps couru
                                    </div>
                                    <div className="mt-1 text-3xl font-black text-[#18212a]">
                                        {formatHours(domaine.totalMinutes)} h
                                    </div>
                                    <div className="text-xs font-bold text-[#7d705e]">
                                        cumulées
                                    </div>
                                </div>
                                <div className="rounded-lg border-2 border-[#d89b2b]/25 bg-[#fff3cf] p-4">
                                    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#8b5d12]">
                                        Rang actuel
                                    </div>
                                    <div className="mt-1 text-3xl font-black text-[#18212a]">
                                        Niv. {domaine.level}
                                    </div>
                                    <div className="text-xs font-bold text-[#7d705e]">
                                        prochaine montée avec l'XP
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Pas d'objectif actif → création guidée */}
                    {!objectif && <CreateObjectif domaine={domaine} />}

                    {/* Objectif actif */}
                    {objectif && (
                        <>
                            <Card className="quest-shine relative space-y-4 overflow-hidden border-[#3d2d18]/15 bg-[#fffaf0]/95">
                                <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#1f6f5f] via-[#3477a8] to-[#d95f45]" />
                                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge
                                            color={
                                                diffColor[objectif.difficulty]
                                            }
                                        >
                                            Objectif {objectif.difficulty}
                                        </Badge>
                                        <Badge>
                                            {objectif.archetype === "chrono"
                                                ? "Temps cible"
                                                : "Finir la distance"}
                                        </Badge>
                                        {objectif.niveau && (
                                            <Badge>{objectif.niveau}</Badge>
                                        )}
                                    </div>
                                    <span className="rounded-lg border-2 border-[#d89b2b]/30 bg-[#fff3cf] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#8b5d12]">
                                        Objectif en cours
                                    </span>
                                </div>
                                <h2 className="text-2xl font-black leading-tight text-[#18212a]">
                                    {objectif.title}
                                </h2>
                                <div className="grid gap-3 text-sm sm:grid-cols-2">
                                    <div className="rounded-lg border-2 border-[#3477a8]/20 bg-[#3477a8]/10 p-3">
                                        <div className="text-xs font-black uppercase tracking-[0.14em] text-[#3477a8]">
                                            Cible
                                        </div>
                                        <div className="mt-1 font-black text-[#18212a]">
                                            {targetLabel(objectif)}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border-2 border-[#d89b2b]/25 bg-[#fff3cf] p-3">
                                        <div className="text-xs font-black uppercase tracking-[0.14em] text-[#8b5d12]">
                                            Échéance
                                        </div>
                                        <div className="mt-1 font-black text-[#18212a]">
                                            {objectif.deadline
                                                ? new Date(
                                                      objectif.deadline,
                                                  ).toLocaleDateString("fr-FR")
                                                : "Libre"}
                                        </div>
                                    </div>
                                </div>
                                {estimateLabel(objectif) && (
                                    <div className="rounded-lg border-2 border-[#1f6f5f]/25 bg-[#1f6f5f]/10 p-3">
                                        <div className="text-xs font-black uppercase tracking-[0.14em] text-[#1f6f5f]">
                                            Estimation actuelle
                                        </div>
                                        <div className="mt-1 text-lg font-black text-[#18212a]">
                                            {estimateLabel(objectif)}
                                        </div>
                                        <div className="text-xs font-bold text-[#7d705e]">
                                            recalculée à chaque séance validée
                                            — les allures restantes du plan
                                            s'ajustent automatiquement
                                        </div>
                                    </div>
                                )}
                                {targetReached && (
                                    <div className="animate-pop rounded-lg border-2 border-[#1f6f5f]/30 bg-[#1f6f5f]/15 p-3 text-center font-black text-[#1f6f5f]">
                                        🎯 Objectif atteint ! Valide-le
                                        pour récupérer ta récompense.
                                    </div>
                                )}
                            </Card>

                            {/* Plan pas encore généré */}
                            {taches.length === 0 && (
                                <Card className="space-y-4 border-dashed border-[#3477a8]/35 bg-[#e9f3fb]/85 text-center">
                                    <p className="font-semibold text-[#31526d]">
                                        Le plan d'entraînement n'est pas encore
                                        tracé. Le coach peut générer les
                                        séances jusqu'à l'objectif.
                                    </p>
                                    <Button
                                        onClick={() => generatePlan.mutate()}
                                        disabled={generatePlan.isPending}
                                    >
                                        {generatePlan.isPending
                                            ? "Construction…"
                                            : "Tracer la route"}
                                    </Button>
                                    {generatePlan.isError && (
                                        <ErrorMsg>
                                            {generatePlan.error.message}
                                        </ErrorMsg>
                                    )}
                                </Card>
                            )}

                            {/* Parcours + détail de l'étape */}
                            {taches.length > 0 && (
                                <Card className="space-y-5 border-[#3d2d18]/15 bg-[#fffaf0]/95">
                                    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
                                        <TrainingPath
                                            seances={taches}
                                            selectedId={selectedId}
                                            onSelect={setSelectedId}
                                        />

                                        <div className="space-y-3 lg:sticky lg:top-8">
                                            {selected && (
                                                <SeanceDetail
                                                    seance={selected}
                                                    isCurrent={
                                                        selected.id ===
                                                        currentId
                                                    }
                                                    isDone={
                                                        selected.status ===
                                                        "fait"
                                                    }
                                                    onComplete={(perf) =>
                                                        completeStep.mutate({
                                                            step: selected,
                                                            perf,
                                                        })
                                                    }
                                                    pending={
                                                        completeStep.isPending
                                                    }
                                                />
                                            )}
                                            {completeStep.isError && (
                                                <ErrorMsg>
                                                    {completeStep.error.message}
                                                </ErrorMsg>
                                            )}
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
                                                : allDone || targetReached
                                                  ? "Réclamer la récompense finale"
                                                  : "Valider l'objectif maintenant"}
                                        </Button>
                                        {validate.isError && (
                                            <ErrorMsg>
                                                {validate.error.message}
                                            </ErrorMsg>
                                        )}
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

function MissionHeader({ level, totalHours, objectifsTermines }) {
    return (
        <section className="game-panel overflow-hidden rounded-lg border-2 border-[#172126]/20 bg-[#172126] text-white shadow-2xl shadow-slate-900/20">
            <div className="grid gap-5 p-5 md:grid-cols-[1.2fr_0.8fr] md:p-6">
                <div>
                    <div className="mb-3 inline-flex rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#f0c66b]">
                        Carnet d'entraînement
                    </div>
                    <h1 className="max-w-2xl text-3xl font-black leading-tight md:text-4xl">
                        Chaque séance te rapproche de ton objectif.
                    </h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                        Avance séance après séance, gagne de l'XP et fais
                        monter ton niveau par la pratique.
                    </p>
                </div>
                <div className="grid grid-cols-3 gap-2 self-end">
                    <StatTile icon="★" label="Niveau" value={level} tone="teal" />
                    <StatTile
                        icon="⌁"
                        label="Heures"
                        value={totalHours}
                        tone="gold"
                    />
                    <StatTile
                        icon="🏆"
                        label="Trophées"
                        value={objectifsTermines}
                        tone="coral"
                    />
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
            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] opacity-80">
                {label}
            </div>
        </div>
    );
}

// Guide d'avancement : les 3 étapes du cycle de jeu, avec l'étape courante mise en avant.
function QuestStepper({ hasObjectif, hasPlan, allDone }) {
    const steps = [
        { icon: "★", label: "Définis ton objectif", done: hasObjectif },
        { icon: "🗺", label: "Trace ton plan", done: hasPlan },
        {
            icon: "🏆",
            label: allDone
                ? "Réclame ta récompense !"
                : "Avance vers l'objectif",
            done: false,
        },
    ];
    const current = steps.findIndex((s) => !s.done);

    return (
        <Card className="border-[#3d2d18]/15 bg-[#fffaf0]/90 p-4">
            <ol className="grid gap-2 sm:grid-cols-3">
                {steps.map((s, i) => {
                    const isCurrent = i === current;
                    const cls = s.done
                        ? "border-[#1f6f5f]/30 bg-[#1f6f5f]/10 text-[#1f6f5f]"
                        : isCurrent
                          ? "border-[#d89b2b] bg-[#fff3cf] text-[#7f5513] shadow-md shadow-amber-900/10"
                          : "border-[#3d2d18]/10 bg-white/60 text-[#9a8d79]";
                    return (
                        <li
                            key={s.label}
                            className={`flex items-center gap-2.5 rounded-lg border-2 p-2.5 transition ${cls}`}
                        >
                            <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${
                                    s.done
                                        ? "bg-[#1f6f5f] text-white"
                                        : isCurrent
                                          ? "bg-[#d89b2b] text-[#2b2114]"
                                          : "bg-[#efe4ce]"
                                }`}
                            >
                                {s.done ? "✓" : s.icon}
                            </span>
                            <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
                                    Étape {i + 1}
                                </div>
                                <div className="truncate text-xs font-black">
                                    {s.label}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </Card>
    );
}

function SeanceDetail({ seance, isCurrent, isDone, onComplete, pending }) {
    const meta = templateMeta(seance.templateKey);
    const [dist, setDist] = useState("");
    const [time, setTime] = useState("");

    // Construit la perf réelle (facultative) à partir des champs saisis, puis valide.
    function submit() {
        let perf = null;
        const d = Number(dist);
        const sec = parseTime(time);
        if (d > 0 && sec) perf = { perfDistanceKm: d, perfDurationSec: sec };
        onComplete(perf);
    }

    return (
        <div
            className={`rounded-lg border-2 p-4 ${
                isDone
                    ? "border-[#1f6f5f]/25 bg-[#1f6f5f]/10"
                    : isCurrent
                      ? "border-[#d89b2b]/35 bg-[#fff3cf]"
                      : "border-[#3d2d18]/12 bg-[#fff8e8]/70"
            }`}
        >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge color={meta.badge}>
                        {meta.emoji} {meta.label}
                    </Badge>
                    <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-black text-[#7d705e]">
                        Semaine {seance.weekIndex}
                    </span>
                    {seance.estDurationMin != null && (
                        <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-black text-[#7d705e]">
                            ≈ {seance.estDurationMin} min
                        </span>
                    )}
                    {isDone && <Badge color="green">Séance faite</Badge>}
                </div>
                <span className="rounded-md border border-[#3d2d18]/10 bg-white/70 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#6c5a3a]">
                    Étape {seance.orderIndex}
                </span>
            </div>
            <p className="text-xl font-black text-[#18212a]">{seance.title}</p>
            {seance.targetLabel && (
                <p className="mt-1 text-sm font-black text-[#1f6f5f]">
                    🎯 Cible : {seance.targetLabel}
                </p>
            )}
            {seance.description && (
                <p className="mt-1 text-sm font-medium text-[#6c5a3a]">
                    {seance.description}
                </p>
            )}

            <div className="mt-3">
                {isDone ? (
                    <p className="text-sm font-black text-[#1f6f5f]">
                        XP déjà gagnée sur cette séance.
                    </p>
                ) : isCurrent ? (
                    <div className="space-y-3">
                        <div className="rounded-lg border-2 border-[#3d2d18]/12 bg-white/70 p-3">
                            <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#6c5a3a]">
                                Ta perf réelle (affine l'estimation et ajuste
                                les prochaines séances)
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Field label="Distance (km)">
                                    <Input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        inputMode="decimal"
                                        value={dist}
                                        onChange={(e) =>
                                            setDist(e.target.value)
                                        }
                                        placeholder="5"
                                    />
                                </Field>
                                <Field label="Temps (mm:ss)">
                                    <Input
                                        value={time}
                                        onChange={(e) =>
                                            setTime(e.target.value)
                                        }
                                        placeholder="24:00"
                                    />
                                </Field>
                            </div>
                            <p className="mt-1 text-xs font-medium text-[#9a8d79]">
                                Facultatif — laisse vide si tu ne l'as pas
                                mesuré.
                            </p>
                        </div>
                        <Button onClick={submit} disabled={pending}>
                            {pending
                                ? "Enregistrement…"
                                : "Valider cette séance"}
                        </Button>
                    </div>
                ) : (
                    <p className="text-sm font-bold text-[#9a8d79]">
                        Séance verrouillée jusqu'aux étapes précédentes.
                    </p>
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
                    <li
                        key={o.id}
                        className="flex items-center justify-between gap-3 rounded-lg border-2 border-[#d89b2b]/20 bg-[#fff3cf] px-3 py-2 text-sm"
                    >
                        <span className="font-black text-[#46351f]">
                            🏆 {o.title}
                        </span>
                        <span className="font-bold text-[#8a785e]">
                            {o.validatedAt
                                ? new Date(o.validatedAt).toLocaleDateString(
                                      "fr-FR",
                                  )
                                : ""}
                        </span>
                    </li>
                ))}
            </ul>
        </Card>
    );
}
