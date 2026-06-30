// Coquille de l'app authentifiée : barre de navigation claire + contenu (Outlet).
import { Link, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getUser } from "../lib/auth";

export default function Layout() {
  const navigate = useNavigate();
  const user = getUser();

  function logout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-extrabold text-slate-800">
            <span className="text-xl">🎯</span>
            <span>Système d'évolution</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user && <span className="text-slate-500">{user.username}</span>}
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
