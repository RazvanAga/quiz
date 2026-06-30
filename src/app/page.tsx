import Link from "next/link";

// Player entry (name + Avatar + Game PIN) is built in #5. For now, a minimal
// landing that points to the Admin authoring area.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Quiz</h1>
        <p className="text-slate-400">A self-hosted, Kahoot-style live trivia app.</p>
      </header>
      <Link
        href="/admin"
        className="inline-block w-fit rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-500"
      >
        Go to the Quiz library
      </Link>
    </main>
  );
}
