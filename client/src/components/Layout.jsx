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
      <header className="sticky top-0 z-20 border-b border-slate-900/10 bg-[#eef3f1]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-3 font-extrabold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#15615f] text-sm text-white shadow-lg shadow-teal-900/15">
              SE
            </span>
            <span className="hidden sm:inline">Système d'évolution</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user && (
              <span className="rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 font-medium text-slate-600">
                {user.username}
              </span>
            )}
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 bg-white/70 px-3 py-1.5 font-semibold text-slate-600 transition hover:border-[#15615f]/40 hover:bg-white"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
