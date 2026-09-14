"use client";

import { useActionState, useState } from "react";
import { compileDescription } from "./actions";
import type { CompileResult, SkillSpec } from "@/compiler";

export function Studio() {
  const [description, setDescription] = useState("");
  const [result, action, pending] = useActionState(
    compileDescription,
    null as CompileResult | null,
  );
  const error = result !== null && !result.ok ? result.message : null;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="description"
            className="text-sm font-medium tracking-wide text-[var(--ink-soft)] uppercase"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={8}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? "description-error" : undefined}
            placeholder="Describe the Skill you want. English or Russian."
            className="min-h-40 w-full resize-y rounded-md border border-[var(--rule)] bg-[var(--paper-raised)] px-4 py-3 font-[family-name:var(--font-inter)] text-base leading-7 text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--pine)] focus:ring-2 focus:ring-[var(--pine-ring)]"
          />
        </div>
        {error ? (
          <p
            id="description-error"
            role="alert"
            className="rounded-md border border-[var(--error-border)] bg-[var(--error-bg)] px-3 py-2 text-sm text-[var(--error)]"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 w-fit items-center justify-center rounded-md bg-[var(--pine)] px-5 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--pine-dark)] disabled:cursor-wait disabled:opacity-70"
        >
          {pending ? "Compiling…" : "Compile"}
        </button>
      </form>
      {result?.ok ? (
        <SkillSpecView skillSpec={result.skillSpec} />
      ) : (
        <aside className="rounded-md border border-dashed border-[var(--rule)] bg-[var(--paper-raised)]/50 px-6 py-8 text-[var(--ink-soft)]">
          <p className="text-sm leading-6">
            Compile a Description to see the Skill Spec: when it applies,
            invariants, and anti-goals.
          </p>
        </aside>
      )}
    </div>
  );
}

function SkillSpecView({ skillSpec }: { skillSpec: SkillSpec }) {
  return (
    <article
      aria-labelledby="skill-spec-heading"
      className="rounded-md border border-[var(--rule)] bg-[var(--paper-raised)] px-6 py-6 shadow-[0_10px_30px_rgba(28,25,21,0.06)]"
    >
      <h2
        id="skill-spec-heading"
        className="font-[family-name:var(--font-source-serif)] text-2xl text-[var(--ink)]"
      >
        Skill Spec
      </h2>
      <section className="mt-6">
        <h3 className="text-xs font-medium tracking-[0.14em] text-[var(--ink-soft)] uppercase">
          When
        </h3>
        <p className="mt-2 text-base leading-7 text-[var(--ink)]">
          {skillSpec.when}
        </p>
      </section>
      <section className="mt-6">
        <h3 className="text-xs font-medium tracking-[0.14em] text-[var(--ink-soft)] uppercase">
          Invariants
        </h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7 text-[var(--ink)]">
          {skillSpec.invariants.map((invariant) => (
            <li key={invariant}>{invariant}</li>
          ))}
        </ul>
      </section>
      <section className="mt-6">
        <h3 className="text-xs font-medium tracking-[0.14em] text-[var(--ink-soft)] uppercase">
          Anti-goals
        </h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7 text-[var(--ink)]">
          {skillSpec.antiGoals.map((antiGoal) => (
            <li key={antiGoal}>{antiGoal}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}
