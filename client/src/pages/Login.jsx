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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-900/10 bg-white/90">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#15615f] text-sm font-black text-white shadow-lg shadow-teal-900/15">
            SE
          </div>
          <h1 className="text-2xl font-black text-slate-900">Système d'évolution</h1>
          <p className="text-sm text-slate-500">Connecte-toi pour continuer ta progression</p>
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
            {loading ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Pas de compte ?{" "}
          <Link to="/register" className="font-semibold text-emerald-600 hover:underline">
            Créer un compte
          </Link>
        </p>
      </Card>
    </div>
  );
}
