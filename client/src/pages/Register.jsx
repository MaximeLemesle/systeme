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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-900/10 bg-white/90">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[#15615f] text-sm font-black text-white shadow-lg shadow-teal-900/15">
            SE
          </div>
          <h1 className="text-2xl font-black text-slate-900">Créer un compte</h1>
          <p className="text-sm text-slate-500">Commence ta progression dans tes domaines clés</p>
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
            {loading ? "Création…" : "Créer mon compte"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Déjà inscrit ?{" "}
          <Link to="/login" className="font-semibold text-emerald-600 hover:underline">
            Se connecter
          </Link>
        </p>
      </Card>
    </div>
  );
}
