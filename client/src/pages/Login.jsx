import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { setSession } from "../lib/auth";
import { Card, Button, Field, Input, ErrorMsg } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?session=expired est ajouté par le wrapper API quand un 401 nous a déconnectés.
  const sessionExpired = searchParams.get("session") === "expired";
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
        <section className="game-panel hidden overflow-hidden rounded-lg border-2 border-[#2b211d]/15 bg-[#1c1410] p-7 text-white md:block">
          <div className="mb-10 inline-flex rounded-md border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#ffd98a]">
            Running Club
          </div>
          <h1 className="max-w-lg text-4xl font-display leading-tight">
            Prépare ton prochain objectif de course.
          </h1>
          <div className="mt-8 grid gap-3">
            {[
              ["01", "Définis ton objectif"],
              ["02", "Suis ton plan personnalisé"],
              ["03", "Gagne de l'XP à chaque séance"],
            ].map(([step, label]) => (
              <div key={step} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-3 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#d9a441] font-black text-[#2b1c0a]">
                  {step}
                </span>
                <span className="font-black text-slate-100">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <Card className="w-full border-[#2b211d]/15 bg-[#faf5ee]/95">
          <div className="mb-5 text-center">
            <div className="quest-shine mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg border-b-4 border-[#7a2a15] bg-[#c8532f] text-sm font-black text-white shadow-lg shadow-black/15">
              XP
            </div>
            <h1 className="font-display text-3xl text-[#2b211d]">Running Club</h1>
            <p className="text-sm font-medium text-[#8a6f5f]">Connecte-toi à ton espace running</p>
          </div>
          {sessionExpired && (
            <div className="mb-4 rounded-lg border-2 border-[#d9a441]/40 bg-[#faf0df] px-3 py-2 text-center text-sm font-black text-[#6b4a1a]">
              Votre session a expiré. Veuillez vous reconnecter.
            </div>
          )}
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
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm font-medium text-[#8a6f5f]">
            Pas de compte ?{" "}
            <Link to="/register" className="font-black text-[#c8532f] hover:underline">
              Créer un compte
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
