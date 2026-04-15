import { Link, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-6">
        <Link to="/" className="text-xl font-bold text-indigo-400">
          Adversarial Dialogue Trainer
        </Link>
        <nav className="flex gap-4 text-sm text-gray-400">
          <Link to="/" className="hover:text-gray-100 transition">
            Scenarios
          </Link>
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
