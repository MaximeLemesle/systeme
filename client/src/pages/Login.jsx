import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { setSession } from "../lib/auth";
import { Card, Button, Field, Input, ErrorMsg } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await api("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setSession(token, user);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-5 md:grid-cols-[1fr_420px]">
        <section className="game-panel hidden overflow-hidden rounded-lg border-2 border-[#3d2d18]/15 bg-[#172126] p-7 text-white md:block">
          <div className="mb-10 inline-flex rounded-md border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#f0c66b]">
            Coach course à pied
          </div>
          <h1 className="max-w-lg text-4xl font-black leading-tight">
            Reprends ton entraînement et avance vers ton objectif.
          </h1>
          <div className="mt-8 grid gap-3">
            {[
              ["01", "Définis ton objectif de course"],
              ["02", "Suis ton plan personnalisé"],
              ["03", "Gagne de l'XP à chaque séance"],
            ].map(([step, label]) => (
              <div key={step} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-3 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#d89b2b] font-black text-[#2b2114]">
                  {step}
                </span>
                <span className="font-black text-slate-100">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <Card className="w-full border-[#3d2d18]/15 bg-[#fffaf0]/95">
          <div className="mb-5 text-center">
            <div className="quest-shine mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg border-b-4 border-[#174d42] bg-[#1f6f5f] text-sm font-black text-white shadow-lg shadow-emerald-950/15">
              XP
            </div>
            <h1 className="text-2xl font-black text-[#18212a]">Coach course à pied</h1>
            <p className="text-sm font-medium text-[#7d705e]">Connexion à ton espace coureur</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Mot de passe">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <ErrorMsg>{error}</ErrorMsg>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion…" : "Reprendre ma progression"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm font-medium text-[#7d705e]">
            Pas de compte ?{" "}
            <Link to="/register" className="font-black text-[#1f6f5f] hover:underline">
              Créer un compte
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
