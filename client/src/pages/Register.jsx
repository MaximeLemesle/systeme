import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { setSession } from "../lib/auth";
import { Card, Button, Field, Input, ErrorMsg } from "../components/ui";

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await api("/auth/register", {
        method: "POST",
        body: form,
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
            Nouvelle partie
          </div>
          <h1 className="max-w-lg text-4xl font-black leading-tight">
            Crée ton profil et transforme tes objectifs en campagne.
          </h1>
          <div className="mt-8 rounded-lg border border-white/10 bg-white/10 p-4">
            <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#f0c66b]">
              Profil joueur
            </div>
            <div className="flex items-end gap-3">
              <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#d89b2b] text-2xl font-black text-[#2b2114]">
                1
              </span>
              <div>
                <div className="font-black">Niveau de départ</div>
                <div className="text-sm text-slate-300">L'XP se gagne ensuite par les sessions validées.</div>
              </div>
            </div>
          </div>
        </section>

        <Card className="w-full border-[#3d2d18]/15 bg-[#fffaf0]/95">
          <div className="mb-5 text-center">
            <div className="quest-shine mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg border-b-4 border-[#174d42] bg-[#1f6f5f] text-sm font-black text-white shadow-lg shadow-emerald-950/15">
              XP
            </div>
            <h1 className="text-2xl font-black text-[#18212a]">Créer une partie</h1>
            <p className="text-sm font-medium text-[#7d705e]">Prépare ton journal de progression</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Nom d'utilisateur">
              <Input value={form.username} onChange={set("username")} required minLength={3} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={set("email")} required />
            </Field>
            <Field label="Mot de passe (min. 6)">
              <Input
                type="password"
                value={form.password}
                onChange={set("password")}
                required
                minLength={6}
              />
            </Field>
            <ErrorMsg>{error}</ErrorMsg>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Création…" : "Démarrer l'aventure"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm font-medium text-[#7d705e]">
            Déjà inscrit ?{" "}
            <Link to="/login" className="font-black text-[#1f6f5f] hover:underline">
              Reprendre ma partie
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
