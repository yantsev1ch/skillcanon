"use client";

import { useActionState, useState } from "react";
import { compileDescription } from "./actions";
import {
  check,
  zipBundle,
  type Bundle,
  type Canon,
  type CheckResult,
  type CompatibilityReport,
  type CompileResult,
  type SkillSpec,
} from "@/compiler";

export function Studio() {
  const [description, setDescription] = useState("");
  const [result, action, pending] = useActionState(
    compileDescription,
    null as CompileResult | null,
  );
  const error = result !== null && !result.ok ? result.message : null;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
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
            {pending ? "Compiling…" : error ? "Retry" : "Compile"}
          </button>
        </form>
        {result?.ok ? (
          <SkillSpecView skillSpec={result.skillSpec} />
        ) : (
          <aside className="rounded-md border border-dashed border-[var(--rule)] bg-[var(--paper-raised)]/50 px-6 py-8 text-[var(--ink-soft)]">
            <p className="text-sm leading-6">
              Compile a Description to see the Skill Spec, then a Canon preview,
              a Compatibility Report, a Bundle zip, and Check.
            </p>
          </aside>
        )}
      </div>
      {result?.ok ? (
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
          <CanonView canon={result.canon} />
          <CompatibilityReportView report={result.compatibilityReport} />
        </div>
      ) : null}
      {result?.ok ? (
        <BundleView
          bundle={result.bundle}
          folderName={result.canon.folderName}
        />
      ) : null}
      {result?.ok ? (
        <CheckView checkResult={check(result.canon, result.bundle)} />
      ) : null}
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

function CanonView({ canon }: { canon: Canon }) {
  return (
    <article
      aria-labelledby="canon-heading"
      className="rounded-md border border-[var(--rule)] bg-[var(--paper-raised)] px-6 py-6 shadow-[0_10px_30px_rgba(28,25,21,0.06)]"
    >
      <h2
        id="canon-heading"
        className="font-[family-name:var(--font-source-serif)] text-2xl text-[var(--ink)]"
      >
        Canon
      </h2>
      <p className="mt-2 font-mono text-sm text-[var(--ink-soft)]">
        {canon.folderName}/SKILL.md
      </p>
      <pre className="mt-6 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--rule)] bg-[var(--paper)] px-4 py-3 font-mono text-sm leading-6 text-[var(--ink)]">
        {canon.markdown}
      </pre>
    </article>
  );
}

function CompatibilityReportView({ report }: { report: CompatibilityReport }) {
  return (
    <article
      aria-labelledby="compatibility-report-heading"
      className="rounded-md border border-[var(--rule)] bg-[var(--paper-raised)] px-6 py-6 shadow-[0_10px_30px_rgba(28,25,21,0.06)]"
    >
      <h2
        id="compatibility-report-heading"
        className="font-[family-name:var(--font-source-serif)] text-2xl text-[var(--ink)]"
      >
        Compatibility Report
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
        Which Agent Skills fields this Canon will honor or ignore on Cursor vs
        Claude Code.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--rule)] text-xs font-medium tracking-[0.14em] text-[var(--ink-soft)] uppercase">
              <th className="py-2 pr-3 font-medium">Field</th>
              <th className="py-2 pr-3 font-medium">In Canon</th>
              <th className="py-2 pr-3 font-medium">Cursor</th>
              <th className="py-2 font-medium">Claude Code</th>
            </tr>
          </thead>
          <tbody>
            {report.fields.map((entry) => (
              <tr
                key={entry.field}
                className="border-b border-[var(--rule)] last:border-b-0"
              >
                <th
                  scope="row"
                  className="py-3 pr-3 font-mono text-sm font-normal text-[var(--ink)]"
                >
                  {entry.field}
                </th>
                <td className="py-3 pr-3 text-[var(--ink-soft)]">
                  {entry.present ? "Yes" : "No"}
                </td>
                <td className="py-3 pr-3">
                  <VerdictBadge verdict={entry.cursor} />
                </td>
                <td className="py-3">
                  <VerdictBadge verdict={entry.claudeCode} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function VerdictBadge({ verdict }: { verdict: "honored" | "ignored" }) {
  if (verdict === "honored") {
    return (
      <span className="inline-flex rounded-full bg-[var(--pine)]/10 px-2 py-0.5 text-xs font-medium tracking-wide text-[var(--pine)] uppercase">
        Honored
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-[var(--rule)]/60 px-2 py-0.5 text-xs font-medium tracking-wide text-[var(--ink-soft)] uppercase">
      Ignored
    </span>
  );
}

function BundleView({
  bundle,
  folderName,
}: {
  bundle: Bundle;
  folderName: string;
}) {
  return (
    <article
      aria-labelledby="bundle-heading"
      className="rounded-md border border-[var(--rule)] bg-[var(--paper-raised)] px-6 py-6 shadow-[0_10px_30px_rgba(28,25,21,0.06)]"
    >
      <h2
        id="bundle-heading"
        className="font-[family-name:var(--font-source-serif)] text-2xl text-[var(--ink)]"
      >
        Bundle
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
        One zip with a Cursor Projection, a Claude Code Projection, INSTALL.md,
        and evals/cases.json. Both Projections contain the same Canon bytes.
      </p>
      <ul className="mt-6 list-disc space-y-2 pl-5 font-mono text-sm leading-6 text-[var(--ink)]">
        {Object.keys(bundle.files).map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => downloadBundle(bundle, folderName)}
        className="mt-6 inline-flex h-11 w-fit items-center justify-center rounded-md bg-[var(--pine)] px-5 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--pine-dark)]"
      >
        Download Bundle zip
      </button>
    </article>
  );
}

function CheckView({ checkResult }: { checkResult: CheckResult }) {
  return (
    <article
      aria-labelledby="check-heading"
      className="rounded-md border border-[var(--rule)] bg-[var(--paper-raised)] px-6 py-6 shadow-[0_10px_30px_rgba(28,25,21,0.06)]"
    >
      <h2
        id="check-heading"
        className="font-[family-name:var(--font-source-serif)] text-2xl text-[var(--ink)]"
      >
        Check
      </h2>
      <section className="mt-6" aria-labelledby="lint-heading">
        <h3
          id="lint-heading"
          className="text-xs font-medium tracking-[0.14em] text-[var(--ink-soft)] uppercase"
        >
          Lint
        </h3>
        {checkResult.lint.ok ? (
          <p className="mt-2 text-base leading-7 text-[var(--ink)]">
            Lint passed.
          </p>
        ) : (
          <ul className="mt-2 list-disc space-y-2 pl-5 text-base leading-7 text-[var(--error)]">
            {checkResult.lint.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </section>
      <p
        role="status"
        className="mt-6 rounded-md border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-soft)]"
      >
        Judge {checkResult.judge.status}
      </p>
    </article>
  );
}

function downloadBundle(bundle: Bundle, folderName: string) {
  const zip = zipBundle(bundle);
  const bytes = new Uint8Array(zip.byteLength);
  bytes.set(zip);
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${folderName}-bundle.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
