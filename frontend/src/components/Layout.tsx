import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="app-shell-bg relative flex min-h-screen flex-col">
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 pb-4 pt-6 sm:px-6 sm:pb-5 sm:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
