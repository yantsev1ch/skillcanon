import { expect, test } from "vitest";
import { compile, createFakeModelAdapter, zipBundle } from "@/compiler";
import type { ModelAdapter, SkillSpec } from "@/compiler";

const explodingAdapter: ModelAdapter = {
  generateSkillSpec: async () => {
    throw new Error("model adapter must not be called");
  },
  generateCanon: async () => {
    throw new Error("model adapter must not be called");
  },
  generateEvalCases: async () => {
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

const prReviewEvalCases = [
  {
    scenario: "A reviewer is about to approve a pull request with no tests",
    must: ["Ask for tests before approving"],
    mustNot: ["Rewrite files the pull request did not touch"],
  },
];

const prReviewCanonMarkdown = `---
name: pr-review
description: "Reviews pull requests for missing tests."
---

Require tests before approving.
`;

const prReviewInstallMarkdown = `# Install

This Bundle has two Projections of the same Canon. Copy the folder for your runtime; path is the only difference.

## Cursor

Copy \`cursor/pr-review/\` to \`.cursor/skills/pr-review/\` in your project, or to \`~/.cursor/skills/pr-review/\` for every project.

## Claude Code

Copy \`claude/pr-review/\` to \`.claude/skills/pr-review/\` in your project, or to \`~/.claude/skills/pr-review/\` for every project.
`;

function compilePrReview(canon: unknown = prReviewCanon) {
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => prReviewSkillSpec,
    generateCanon: async () => canon,
    generateEvalCases: async () => prReviewEvalCases,
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
    markdown: prReviewCanonMarkdown,
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

test("Bundle contains Cursor and Claude Code Projections with identical Canon bytes", async () => {
  const result = await compilePrReview();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Bundle");
  }

  expect(result.bundle.files["cursor/pr-review/SKILL.md"]).toBe(
    prReviewCanonMarkdown,
  );
  expect(result.bundle.files["claude/pr-review/SKILL.md"]).toBe(
    prReviewCanonMarkdown,
  );
});

test("Bundle INSTALL.md says where to copy each Projection", async () => {
  const result = await compilePrReview();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Bundle");
  }
  expect(result.bundle.files["INSTALL.md"]).toBe(prReviewInstallMarkdown);
});

test("Bundle evals/cases.json uses Eval Cases produced with the Skill Spec", async () => {
  let receivedSkillSpec: SkillSpec | undefined;
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => prReviewSkillSpec,
    generateCanon: async () => prReviewCanon,
    generateEvalCases: async ({ skillSpec }) => {
      receivedSkillSpec = skillSpec;
      return prReviewEvalCases;
    },
  };

  const result = await compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Bundle");
  }
  expect(receivedSkillSpec).toEqual(prReviewSkillSpec);
  expect(JSON.parse(result.bundle.files["evals/cases.json"])).toEqual(
    prReviewEvalCases,
  );
});

test("zipBundle zip contains Cursor and Claude Code Projections, INSTALL.md, and evals/cases.json", async () => {
  const result = await compilePrReview();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return a Bundle");
  }

  const files = readStoredZip(zipBundle(result.bundle));
  expect(files["cursor/pr-review/SKILL.md"]).toBe(prReviewCanonMarkdown);
  expect(files["claude/pr-review/SKILL.md"]).toBe(prReviewCanonMarkdown);
  expect(files["INSTALL.md"]).toBe(prReviewInstallMarkdown);
  expect(JSON.parse(files["evals/cases.json"])).toEqual(prReviewEvalCases);
});

function readStoredZip(zip: Uint8Array): Record<string, string> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const eocdOffset = zip.byteLength - 22;
  if (view.getUint32(eocdOffset, true) !== 0x06054b50) {
    throw new Error("missing ZIP end of central directory");
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const files: Record<string, string> = {};
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("missing ZIP central directory entry");
    }

    const compression = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      zip.subarray(offset + 46, offset + 46 + nameLength),
    );
    if (compression !== 0) {
      throw new Error(`unsupported ZIP compression for ${name}`);
    }

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    files[name] = decoder.decode(zip.subarray(dataStart, dataStart + size));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (offset !== centralOffset + centralSize) {
    throw new Error("ZIP central directory size mismatch");
  }

  return files;
}

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
    generateEvalCases: async () => {
      throw new Error(
        "generateEvalCases must not run after a malformed Skill Spec",
      );
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

test("malformed Eval Cases surface as an error", async () => {
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => prReviewSkillSpec,
    generateCanon: async () => prReviewCanon,
    generateEvalCases: async () => [{ scenario: "A PR has no tests" }],
  };

  const result = await compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject malformed Eval Cases");
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
