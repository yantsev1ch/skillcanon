import * as z from "zod";

export type ModelAdapter = {
  generateSkillSpec: (description: string) => Promise<unknown>;
  generateCanon: (input: {
    description: string;
    skillSpec: SkillSpec;
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

export type CompileResult =
  | {
      ok: true;
      skillSpec: SkillSpec;
      canon: Canon;
      compatibilityReport: CompatibilityReport;
    }
  | { ok: false; message: string };

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

  const output = await adapter.generateSkillSpec(trimmed);
  const parsed = skillSpecSchema.safeParse(output);
  if (!parsed.success) {
    return {
      ok: false,
      message: "The model returned a malformed Skill Spec.",
    };
  }

  const skillSpec = parsed.data;
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

  return {
    ok: true,
    skillSpec,
    canon: {
      name,
      folderName: name,
      description: canonDescription,
      markdown,
    },
    compatibilityReport,
  };
}

const cyrillic = /[\u0400-\u04FF]/;

export function createFakeModelAdapter(): ModelAdapter {
  return {
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
  };
}
