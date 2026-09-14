import { Studio } from "./studio";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-[var(--rule)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-10 sm:px-8">
          <p className="text-xs font-medium tracking-[0.2em] text-[var(--pine)] uppercase">
            Public studio · no account
          </p>
          <h1 className="font-[family-name:var(--font-source-serif)] text-4xl leading-tight text-[var(--ink)] sm:text-5xl">
            Skillcanon
          </h1>
          <p className="max-w-2xl text-base leading-7 text-[var(--ink-soft)]">
            Type a Description. Compile a Skill Spec, then preview the portable
            Canon, a Compatibility Report, and a Bundle zip for Cursor and
            Claude Code.
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 sm:px-8">
        <Studio />
      </main>
    </div>
  );
}
