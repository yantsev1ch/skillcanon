import * as z from "zod";

export type Example = {
  title: string;
  description: string;
};

export type ModelAdapter = {
  model?: string;
  generateSkillSpec: (description: string) => Promise<unknown>;
  generateCanon: (input: {
    description: string;
    skillSpec: SkillSpec;
  }) => Promise<unknown>;
  generateEvalCases: (input: {
    description: string;
    skillSpec: SkillSpec;
  }) => Promise<unknown>;
  judgeEvalCases?: (input: {
    canon: Canon;
    evalCases: EvalCase[];
  }) => Promise<unknown>;
};

export type SkillSpec = {
  when: string;
  invariants: string[];
  antiGoals: string[];
};

export type Canon = {
  name: string;
  folderName: string;
  description: string;
  markdown: string;
};

export type CompatibilityVerdict = "honored" | "ignored";

export type CompatibilityField = {
  field: string;
  present: boolean;
  cursor: CompatibilityVerdict;
  claudeCode: CompatibilityVerdict;
};

export type CompatibilityReport = {
  fields: CompatibilityField[];
};

export type EvalCase = z.infer<typeof evalCaseSchema>;

export type Bundle = {
  files: Record<string, string>;
};

export type Lint = {
  ok: boolean;
  issues: string[];
};

export type JudgeVerdict = "pass" | "warn" | "fail";

export type JudgeCase = {
  scenario: string;
  verdict: JudgeVerdict;
  comment: string;
};

export type Judge =
  | { status: "unavailable" }
  | { status: "available"; cases: JudgeCase[] };

export type CheckResult = {
  lint: Lint;
  judge: Judge;
  model?: string;
};

export type CompileResult =
  | {
      ok: true;
      skillSpec: SkillSpec;
      canon: Canon;
      compatibilityReport: CompatibilityReport;
      bundle: Bundle;
      lint: Lint;
    }
  | { ok: false; message: string };

export async function check(
  canon: Canon,
  bundle: Bundle,
  adapter?: ModelAdapter,
): Promise<CheckResult> {
  return {
    lint: lint(canon, bundle),
    judge: await judge(canon, bundle, adapter),
    model: adapter?.model,
  };
}

async function judge(
  canon: Canon,
  bundle: Bundle,
  adapter?: ModelAdapter,
): Promise<Judge> {
  if (!adapter?.judgeEvalCases) {
    return { status: "unavailable" };
  }

  const evalCases = parseBundleEvalCases(bundle);
  if (!evalCases) {
    return { status: "unavailable" };
  }

  try {
    const parsed = z
      .array(judgeCaseResultSchema)
      .safeParse(await adapter.judgeEvalCases({ canon, evalCases }));
    if (!parsed.success || parsed.data.length !== evalCases.length) {
      return { status: "unavailable" };
    }

    return {
      status: "available",
      cases: parsed.data.map((result, index) => ({
        scenario: evalCases[index].scenario,
        verdict: result.verdict,
        comment: result.comment,
      })),
    };
  } catch {
    return { status: "unavailable" };
  }
}

function parseBundleEvalCases(bundle: Bundle): EvalCase[] | undefined {
  const raw = bundle.files["evals/cases.json"];
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = evalCasesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function lint(canon: Canon, bundle: Bundle): Lint {
  const issues: string[] = [];
  const frontmatter = parseFrontmatter(canon.markdown);

  if (!frontmatter.name) {
    issues.push("Canon frontmatter is missing name.");
  }
  if (!frontmatter.description) {
    issues.push("Canon frontmatter is missing description.");
  }
  if (frontmatter.name && frontmatter.name !== canon.folderName) {
    issues.push("Canon name does not match the Skill folder.");
  }

  const portableFields = new Set(["name", "description"]);
  for (const field of Object.keys(frontmatter)) {
    if (!portableFields.has(field)) {
      issues.push(`Canon uses non-portable field: ${field}.`);
    }
  }

  if (!bundle.files[`cursor/${canon.folderName}/SKILL.md`]) {
    issues.push("Bundle is missing a Cursor Projection.");
  }
  if (!bundle.files[`claude/${canon.folderName}/SKILL.md`]) {
    issues.push("Bundle is missing a Claude Code Projection.");
  }
  if (!bundle.files["INSTALL.md"]) {
    issues.push("Bundle is missing INSTALL.md.");
  }
  if (!bundle.files["evals/cases.json"]) {
    issues.push("Bundle is missing evals/cases.json.");
  }

  return { ok: issues.length === 0, issues };
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  if (!match) {
    return {};
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  return fields;
}

const compatibilityReport: CompatibilityReport = {
  fields: [
    {
      field: "name",
      present: true,
      cursor: "honored",
      claudeCode: "honored",
    },
    {
      field: "description",
      present: true,
      cursor: "honored",
      claudeCode: "honored",
    },
    {
      field: "license",
      present: false,
      cursor: "ignored",
      claudeCode: "honored",
    },
    {
      field: "compatibility",
      present: false,
      cursor: "ignored",
      claudeCode: "honored",
    },
    {
      field: "metadata",
      present: false,
      cursor: "honored",
      claudeCode: "honored",
    },
    {
      field: "allowed-tools",
      present: false,
      cursor: "ignored",
      claudeCode: "honored",
    },
  ],
};

function yamlDoubleQuoted(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

const skillSpecSchema = z.object({
  when: z.string().min(1),
  invariants: z.array(z.string().min(1)).min(1),
  antiGoals: z.array(z.string().min(1)).min(1),
});

const skillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const canonSchema = z
  .object({
    name: skillNameSchema,
    description: z.string().min(1).max(1024),
    body: z.string().min(1),
  })
  .strict();

const evalCaseSchema = z
  .object({
    scenario: z.string().min(1),
    must: z.array(z.string().min(1)).min(1),
    mustNot: z.array(z.string().min(1)).min(1),
  })
  .strict();

const evalCasesSchema = z.array(evalCaseSchema).min(1);

const judgeCaseResultSchema = z
  .object({
    verdict: z.enum(["pass", "warn", "fail"]),
    comment: z.string().min(1),
  })
  .strict();

const bakedExamples = [
  {
    title: "PR review",
    description:
      "Review a pull request before it is merged. Require tests for new behavior. Point at missing coverage and risky diffs. Do not rewrite files the pull request did not touch, and do not approve just to unblock the author.",
    skillSpec: {
      when: "When reviewing a pull request before it is merged",
      invariants: [
        "Require tests for new behavior before approving",
        "Point at missing coverage and risky diffs",
      ],
      antiGoals: [
        "Do not rewrite files the pull request did not touch",
        "Do not approve just to unblock the author",
      ],
    },
    evalCases: [
      {
        scenario:
          "A reviewer is about to approve a pull request that adds an API with no tests",
        must: ["Ask for tests covering the new behavior before approving"],
        mustNot: ["Approve the pull request as-is"],
      },
      {
        scenario:
          "A reviewer is about to rewrite a formatter config the pull request did not touch",
        must: ["Stay inside the pull request diff"],
        mustNot: ["Rewrite files the pull request did not touch"],
      },
    ],
  },
  {
    title: "DB migration",
    description:
      "Write or review a database migration. Use expand/contract so old and new code can run together. Do not drop columns or tables until readers are gone. Do not rewrite the history of migrations that already ran.",
    skillSpec: {
      when: "When writing or reviewing a database migration",
      invariants: [
        "Use expand/contract so old and new code can run together",
        "Do not drop columns or tables until readers are gone",
      ],
      antiGoals: [
        "Do not rewrite the history of migrations that already ran",
      ],
    },
    evalCases: [
      {
        scenario:
          "A migration adds a required column without a default while old code is still running",
        must: ["Use expand/contract so old and new code can run together"],
        mustNot: ["Add a breaking column change in one step"],
      },
      {
        scenario:
          "A migration drops a column that production readers still query",
        must: ["Keep the column until readers are gone"],
        mustNot: ["Drop columns or tables recklessly"],
      },
    ],
  },
  {
    title: "release notes",
    description:
      "Write release notes from the changelog or commit log. Every note should trace to an entry in the log. Do not invent features that are not in the log, and do not hide breaking changes.",
    skillSpec: {
      when: "When writing release notes from a changelog or commit log",
      invariants: [
        "Every note traces to an entry in the log",
        "Call out breaking changes that are in the log",
      ],
      antiGoals: [
        "Do not invent features that are not in the log",
        "Do not hide breaking changes",
      ],
    },
    evalCases: [
      {
        scenario: "The changelog lists a breaking API rename and a bug fix",
        must: ["Mention the breaking API rename"],
        mustNot: ["Hide the breaking change"],
      },
      {
        scenario:
          "The author wants the notes to mention a dashboard that is not in the log",
        must: ["Keep notes aligned with the log"],
        mustNot: ["Invent features that are not in the log"],
      },
    ],
  },
] satisfies readonly {
  title: string;
  description: string;
  skillSpec: SkillSpec;
  evalCases: EvalCase[];
}[];

export const examples: readonly Example[] = bakedExamples.map(
  ({ title, description }) => ({ title, description }),
);

function exampleMatchingDescription(description: string) {
  return bakedExamples.find((example) => example.description === description);
}

async function skillSpecFromAdapter(
  description: string,
  adapter: ModelAdapter,
): Promise<SkillSpec | undefined> {
  const parsed = skillSpecSchema.safeParse(
    await adapter.generateSkillSpec(description),
  );
  return parsed.success ? parsed.data : undefined;
}

export async function compile(
  description: string,
  adapter: ModelAdapter,
): Promise<CompileResult> {
  const trimmed = description.trim();
  if (trimmed === "") {
    return {
      ok: false,
      message: "Enter a Description before compiling.",
    };
  }

  const matchingExample = exampleMatchingDescription(trimmed);
  const skillSpec = matchingExample
    ? matchingExample.skillSpec
    : await skillSpecFromAdapter(trimmed, adapter);
  if (!skillSpec) {
    return {
      ok: false,
      message: "The model returned a malformed Skill Spec.",
    };
  }

  const canonOutput = await adapter.generateCanon({
    description: trimmed,
    skillSpec,
  });
  const parsedCanon = canonSchema.safeParse(canonOutput);
  if (!parsedCanon.success) {
    return {
      ok: false,
      message: "The model returned a malformed Canon.",
    };
  }

  const { name, description: canonDescription, body } = parsedCanon.data;
  const markdown = `---
name: ${name}
description: ${yamlDoubleQuoted(canonDescription)}
---

${body}
`;

  const evalCasesOutput =
    matchingExample?.evalCases ??
    (await adapter.generateEvalCases({
      description: trimmed,
      skillSpec,
    }));
  const parsedEvalCases = evalCasesSchema.safeParse(evalCasesOutput);
  if (!parsedEvalCases.success) {
    return {
      ok: false,
      message: "The model returned malformed Eval Cases.",
    };
  }

  const canon: Canon = {
    name,
    folderName: name,
    description: canonDescription,
    markdown,
  };
  const bundle: Bundle = {
    files: {
      [`cursor/${canon.folderName}/SKILL.md`]: markdown,
      [`claude/${canon.folderName}/SKILL.md`]: markdown,
      "INSTALL.md": installMarkdown(canon.folderName),
      "evals/cases.json": `${JSON.stringify(parsedEvalCases.data, null, 2)}\n`,
    },
  };

  return {
    ok: true,
    skillSpec,
    canon,
    compatibilityReport,
    bundle,
    lint: lint(canon, bundle),
  };
}

function installMarkdown(folderName: string): string {
  return `# Install

This Bundle has two Projections of the same Canon. Copy the folder for your runtime; path is the only difference.

## Cursor

Copy \`cursor/${folderName}/\` to \`.cursor/skills/${folderName}/\` in your project, or to \`~/.cursor/skills/${folderName}/\` for every project.

## Claude Code

Copy \`claude/${folderName}/\` to \`.claude/skills/${folderName}/\` in your project, or to \`~/.claude/skills/${folderName}/\` for every project.
`;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipBundle(bundle: Bundle): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const [name, content] of Object.entries(bundle.files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    localOffset += local.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, locals.length, true);
  eocdView.setUint16(10, locals.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, localOffset, true);

  const zip = new Uint8Array(localOffset + centralSize + eocd.length);
  let offset = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    zip.set(part, offset);
    offset += part.length;
  }
  return zip;
}

const cyrillic = /[\u0400-\u04FF]/;

export function createFakeModelAdapter(): ModelAdapter {
  return {
    model: "fake",
    async generateSkillSpec(description: string) {
      if (cyrillic.test(description)) {
        return {
          when: `Когда работа совпадает с этим описанием: ${description}`,
          invariants: [
            "Соблюдать жёсткие правила из описания.",
            "Не ослаблять ограничения ради скорости.",
          ],
          antiGoals: ["Не делать то, что описание запрещает."],
        };
      }

      return {
        when: `When the work matches this Description: ${description}`,
        invariants: [
          "Keep the hard rules from the Description.",
          "Do not drop constraints just to finish faster.",
        ],
        antiGoals: ["Do not do work the Description forbids."],
      };
    },
    async generateCanon({ skillSpec }) {
      const russian = cyrillic.test(skillSpec.when);
      return {
        name: russian ? "navyk" : "skill",
        description: skillSpec.when.slice(0, 1024),
        body: [
          skillSpec.when,
          "",
          ...skillSpec.invariants.map((invariant) => `- ${invariant}`),
          "",
          ...skillSpec.antiGoals.map((antiGoal) => `- ${antiGoal}`),
        ].join("\n"),
      };
    },
    async generateEvalCases({ skillSpec }) {
      return [
        {
          scenario: `Hidden: work that matches this Skill is about to skip a hard rule. ${skillSpec.when}`,
          must: skillSpec.invariants,
          mustNot: skillSpec.antiGoals,
        },
      ];
    },
    async judgeEvalCases({ evalCases }) {
      return evalCases.map((evalCase) => ({
        verdict: "pass",
        comment: `Canon covers: ${evalCase.must[0]}`,
      }));
    },
  };
}
