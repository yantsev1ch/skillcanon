import { expect, test } from "vitest";
import { compile, createFakeModelAdapter } from "@/compiler";
import type { ModelAdapter, SkillSpec } from "@/compiler";

const explodingAdapter: ModelAdapter = {
  generateSkillSpec: async () => {
    throw new Error("model adapter must not be called");
  },
};

test("empty Description does not compile", async () => {
  const result = await compile("", explodingAdapter);

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject an empty Description");
  }
  expect(result.message).toMatch(/description/i);
});

test("whitespace Description does not compile", async () => {
  const result = await compile("   \n\t  ", explodingAdapter);

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject a whitespace Description");
  }
  expect(result.message).toMatch(/description/i);
});

test("non-empty Description compiles to a Skill Spec with when, invariants, and anti-goals", async () => {
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => ({
      when: "When reviewing a pull request",
      invariants: ["Do not approve without tests"],
      antiGoals: ["Do not rewrite unrelated files"],
    }),
  };

  const result = await compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );

  expect(result).toEqual({
    ok: true,
    skillSpec: {
      when: "When reviewing a pull request",
      invariants: ["Do not approve without tests"],
      antiGoals: ["Do not rewrite unrelated files"],
    },
  });
});

const cyrillic = /[\u0400-\u04FF]/;

function skillSpecText(skillSpec: SkillSpec): string {
  return [skillSpec.when, ...skillSpec.invariants, ...skillSpec.antiGoals].join(
    "\n",
  );
}

test("English Description produces an English Skill Spec", async () => {
  const result = await compile(
    "A skill that reviews pull requests for missing tests.",
    createFakeModelAdapter(),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Skill Spec");
  }
  expect(result.skillSpec.when.length).toBeGreaterThan(0);
  expect(result.skillSpec.invariants.length).toBeGreaterThan(0);
  expect(result.skillSpec.antiGoals.length).toBeGreaterThan(0);
  expect(skillSpecText(result.skillSpec)).not.toMatch(cyrillic);
});

test("Russian Description produces a Russian Skill Spec", async () => {
  const result = await compile(
    "Навык, который ревьюит пул-реквесты на пропущенные тесты.",
    createFakeModelAdapter(),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Skill Spec");
  }
  expect(result.skillSpec.when).toMatch(cyrillic);
  for (const invariant of result.skillSpec.invariants) {
    expect(invariant).toMatch(cyrillic);
  }
  for (const antiGoal of result.skillSpec.antiGoals) {
    expect(antiGoal).toMatch(cyrillic);
  }
});
