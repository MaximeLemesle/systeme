// Coquille de l'app authentifiée : HUD de progression + contenu (Outlet).
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
      <header className="sticky top-0 z-20 border-b-2 border-[#3d2d18]/15 bg-[#fff7e5]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="group flex items-center gap-3 font-extrabold text-[#18212a]">
            <span className="quest-shine flex h-10 w-10 items-center justify-center rounded-lg border-b-4 border-[#174d42] bg-[#1f6f5f] text-sm text-white shadow-lg shadow-emerald-950/15 transition group-hover:-translate-y-0.5">
              XP
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-black uppercase tracking-[0.14em] text-[#6c5a3a]">
                Coach
              </span>
              <span className="block">Course à pied</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user && (
              <span className="flex items-center gap-2 rounded-lg border-2 border-[#3d2d18]/15 bg-white/75 px-3 py-1.5 font-black text-[#46351f]">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#d89b2b] text-xs text-[#2b2114]">
                  {user.username?.slice(0, 1)?.toUpperCase() || "J"}
                </span>
                <span className="hidden sm:inline">{user.username}</span>
              </span>
            )}
            <button
              onClick={logout}
              className="rounded-lg border-2 border-[#3d2d18]/15 bg-white/70 px-3 py-1.5 font-black text-[#6c5a3a] transition hover:border-[#d95f45]/35 hover:bg-white"
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
