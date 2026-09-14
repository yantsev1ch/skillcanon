import { expect, test } from "vitest";
import { compile, createFakeModelAdapter } from "@/compiler";
import type { ModelAdapter, SkillSpec } from "@/compiler";

const explodingAdapter: ModelAdapter = {
  generateSkillSpec: async () => {
    throw new Error("model adapter must not be called");
  },
  generateCanon: async () => {
    throw new Error("model adapter must not be called");
  },
};

const prReviewSkillSpec = {
  when: "When reviewing a pull request",
  invariants: ["Do not approve without tests"],
  antiGoals: ["Do not rewrite unrelated files"],
} as const;

const prReviewCanon = {
  name: "pr-review",
  description: "Reviews pull requests for missing tests.",
  body: "Require tests before approving.",
};

function compilePrReview(canon: unknown = prReviewCanon) {
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => prReviewSkillSpec,
    generateCanon: async () => canon,
  };
  return compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );
}

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
  const result = await compilePrReview();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Skill Spec");
  }
  expect(result.skillSpec).toEqual(prReviewSkillSpec);
});

test("Canon name that is not a Skill identifier does not compile", async () => {
  const result = await compilePrReview({
    ...prReviewCanon,
    name: "PR Review",
  });

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject an invalid Canon name");
  }
  expect(result.message).toMatch(/malformed/i);
});

test("Canon with a non-portable field does not compile", async () => {
  const result = await compilePrReview({
    ...prReviewCanon,
    "allowed-tools": "Bash",
  });

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject a non-portable Canon field");
  }
  expect(result.message).toMatch(/malformed/i);
});

test("compile returns a Canon whose frontmatter includes name and description", async () => {
  const result = await compilePrReview();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Canon");
  }
  expect(result.canon).toEqual({
    name: "pr-review",
    folderName: "pr-review",
    description: "Reviews pull requests for missing tests.",
    markdown: `---
name: pr-review
description: "Reviews pull requests for missing tests."
---

Require tests before approving.
`,
  });
});

test("Canon description with quotes stays valid in SKILL.md frontmatter", async () => {
  const result = await compilePrReview({
    ...prReviewCanon,
    description: 'Reviews "draft" pull requests.',
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Canon");
  }
  expect(result.canon.markdown).toBe(`---
name: pr-review
description: "Reviews \\"draft\\" pull requests."
---

Require tests before approving.
`);
});

test("compile returns a Compatibility Report for Cursor vs Claude Code", async () => {
  const result = await compilePrReview();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Compatibility Report");
  }
  expect(result.compatibilityReport).toEqual({
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
  });
});

test("malformed Skill Spec surfaces as an error", async () => {
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => ({
      when: "When reviewing a pull request",
    }),
    generateCanon: async () => {
      throw new Error("generateCanon must not run after a malformed Skill Spec");
    },
  };

  const result = await compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject a malformed Skill Spec");
  }
  expect(result.message).toMatch(/malformed/i);
});

test("malformed Canon surfaces as an error", async () => {
  const result = await compilePrReview({
    name: "pr-review",
  });

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject a malformed Canon");
  }
  expect(result.message).toMatch(/malformed/i);
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
