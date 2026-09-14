import * as z from "zod";

export type ModelAdapter = {
  generateSkillSpec: (description: string) => Promise<unknown>;
};

export type SkillSpec = {
  when: string;
  invariants: string[];
  antiGoals: string[];
};

export type CompileResult =
  | { ok: true; skillSpec: SkillSpec }
  | { ok: false; message: string };

const skillSpecSchema = z.object({
  when: z.string().min(1),
  invariants: z.array(z.string().min(1)).min(1),
  antiGoals: z.array(z.string().min(1)).min(1),
});

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

  return { ok: true, skillSpec: parsed.data };
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
  };
}
