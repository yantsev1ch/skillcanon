import { expect, test } from "vitest";
import {
  check,
  compile,
  createDailyQuota,
  createFakeModelAdapter,
  createOpenAICompatibleAdapter,
  examples,
  resolveModelAdapter,
  zipBundle,
} from "@/compiler";
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

test("compile returns Lint for a complete portable Canon", async () => {
  const result = await compilePrReview();

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile to return Lint");
  }
  expect(result.lint).toEqual({ ok: true, issues: [] });
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

test("a quota or network failure while compiling surfaces as an error", async () => {
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => {
      throw new Error("429 quota");
    },
    generateCanon: async () => {
      throw new Error("generateCanon must not run after a model failure");
    },
    generateEvalCases: async () => {
      throw new Error("generateEvalCases must not run after a model failure");
    },
  };

  const result = await compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject a quota or network failure");
  }
  expect(result.message).toMatch(/model|key/i);
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

function adapterWithJudge(
  judgeEvalCases: ModelAdapter["judgeEvalCases"],
  model?: string,
): ModelAdapter {
  return {
    ...explodingAdapter,
    model,
    judgeEvalCases,
  };
}

test("Check scores a returned Judge verdict per Eval Case as pass, warn, or fail with a short comment", async () => {
  const evalCases = [
    {
      scenario: "A reviewer is about to approve a pull request with no tests",
      must: ["Ask for tests before approving"],
      mustNot: ["Rewrite files the pull request did not touch"],
    },
    {
      scenario: "A reviewer is about to rewrite an unrelated formatter config",
      must: ["Stay inside the pull request diff"],
      mustNot: ["Rewrite files the pull request did not touch"],
    },
    {
      scenario: "A reviewer is about to approve just to unblock the author",
      must: ["Require tests for new behavior"],
      mustNot: ["Approve just to unblock the author"],
    },
  ];
  const adapter: ModelAdapter = {
    generateSkillSpec: async () => prReviewSkillSpec,
    generateCanon: async () => prReviewCanon,
    generateEvalCases: async () => evalCases,
  };
  const compiled = await compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    compiled.canon,
    compiled.bundle,
    adapterWithJudge(async () => [
      { verdict: "pass", comment: "Canon asks for tests before approving." },
      { verdict: "warn", comment: "Canon is vague about staying in the diff." },
      { verdict: "fail", comment: "Canon never forbids approving to unblock." },
    ]),
  );

  expect(result.lint.ok).toBe(true);
  expect(result.judge).toEqual({
    status: "available",
    cases: [
      {
        scenario: evalCases[0].scenario,
        verdict: "pass",
        comment: "Canon asks for tests before approving.",
      },
      {
        scenario: evalCases[1].scenario,
        verdict: "warn",
        comment: "Canon is vague about staying in the diff.",
      },
      {
        scenario: evalCases[2].scenario,
        verdict: "fail",
        comment: "Canon never forbids approving to unblock.",
      },
    ],
  });
});

test("Check shows the current model name", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    compiled.canon,
    compiled.bundle,
    adapterWithJudge(
      async () => [
        { verdict: "pass", comment: "Canon asks for tests before approving." },
      ],
      "demo-judge",
    ),
  );

  expect(result.model).toBe("demo-judge");
});

test("Check shows Lint and Judge unavailable when the Judge cannot run", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(compiled.canon, compiled.bundle);

  expect(result.lint.ok).toBe(true);
  expect(result.lint.issues).toEqual([]);
  expect(result.judge).toEqual({ status: "unavailable" });
});

test("Check leaves Lint in place when the adapter returns no Judge result", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    compiled.canon,
    compiled.bundle,
    adapterWithJudge(async () => undefined),
  );

  expect(result.lint.ok).toBe(true);
  expect(result.lint.issues).toEqual([]);
  expect(result.judge).toEqual({ status: "unavailable" });
});

test("Check leaves Lint in place when the Judge adapter throws", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    compiled.canon,
    compiled.bundle,
    adapterWithJudge(async () => {
      throw new Error("429 quota");
    }),
  );

  expect(result.lint.ok).toBe(true);
  expect(result.lint.issues).toEqual([]);
  expect(result.judge).toEqual({ status: "unavailable" });
});

test("Check leaves Lint in place when the adapter returns a malformed Judge result", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    compiled.canon,
    compiled.bundle,
    adapterWithJudge(async () => [
      { verdict: "maybe", comment: "not a Judge verdict" },
    ]),
  );

  expect(result.lint.ok).toBe(true);
  expect(result.lint.issues).toEqual([]);
  expect(result.judge).toEqual({ status: "unavailable" });
});

test("Lint fails when Canon frontmatter is missing name", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    {
      ...compiled.canon,
      markdown: compiled.canon.markdown.replace(/^name:.*\n/m, ""),
    },
    compiled.bundle,
  );

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain("Canon frontmatter is missing name.");
});

test("Lint fails when Canon frontmatter is missing description", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    {
      ...compiled.canon,
      markdown: compiled.canon.markdown.replace(/^description:.*\n/m, ""),
    },
    compiled.bundle,
  );

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain(
    "Canon frontmatter is missing description.",
  );
});

test("Lint fails when Canon name does not match the Skill folder", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const folderName = "other-skill";
  const result = await check(
    { ...compiled.canon, folderName },
    {
      files: {
        [`cursor/${folderName}/SKILL.md`]: compiled.canon.markdown,
        [`claude/${folderName}/SKILL.md`]: compiled.canon.markdown,
        "INSTALL.md": compiled.bundle.files["INSTALL.md"],
        "evals/cases.json": compiled.bundle.files["evals/cases.json"],
      },
    },
  );

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain(
    "Canon name does not match the Skill folder.",
  );
});

test("Lint fails when the Canon uses non-portable fields", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    {
      ...compiled.canon,
      markdown: compiled.canon.markdown.replace(
        /^description:.*$/m,
        `$&\nallowed-tools: Bash`,
      ),
    },
    compiled.bundle,
  );

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain(
    "Canon uses non-portable field: allowed-tools.",
  );
});

test("Lint fails when the Bundle is missing a Cursor Projection", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const files = { ...compiled.bundle.files };
  delete files[`cursor/${compiled.canon.folderName}/SKILL.md`];
  const result = await check(compiled.canon, { files });

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain(
    "Bundle is missing a Cursor Projection.",
  );
});

test("Lint fails when the Bundle is missing a Claude Code Projection", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const files = { ...compiled.bundle.files };
  delete files[`claude/${compiled.canon.folderName}/SKILL.md`];
  const result = await check(compiled.canon, { files });

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain(
    "Bundle is missing a Claude Code Projection.",
  );
});

test("Lint fails when the Bundle is missing INSTALL.md", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const files = { ...compiled.bundle.files };
  delete files["INSTALL.md"];
  const result = await check(compiled.canon, { files });

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain("Bundle is missing INSTALL.md.");
});

test("Lint fails when the Bundle is missing evals/cases.json", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const files = { ...compiled.bundle.files };
  delete files["evals/cases.json"];
  const result = await check(compiled.canon, { files });

  expect(result.lint.ok).toBe(false);
  expect(result.lint.issues).toContain("Bundle is missing evals/cases.json.");
});

test("studio offers exactly three Examples: PR review, DB migration, and release notes", () => {
  expect(examples.map((example) => example.title)).toEqual([
    "PR review",
    "DB migration",
    "release notes",
  ]);
});

test("each Example has a Description a Visitor can edit before compile", () => {
  expect(examples).toHaveLength(3);
  for (const example of examples) {
    expect(example.description.trim().length).toBeGreaterThan(0);
  }
});

test("walking an Example reaches Skill Spec, Canon, Bundle, and Check", async () => {
  for (const example of examples) {
    const adapter = createFakeModelAdapter();
    const result = await compile(example.description, adapter);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected ${example.title} to compile`);
    }
    expect(result.skillSpec.when.length).toBeGreaterThan(0);
    expect(result.skillSpec.invariants.length).toBeGreaterThan(0);
    expect(result.skillSpec.antiGoals.length).toBeGreaterThan(0);
    expect(result.canon.markdown).toContain("name:");
    expect(result.bundle.files[`cursor/${result.canon.folderName}/SKILL.md`]).toBe(
      result.canon.markdown,
    );
    expect(result.bundle.files[`claude/${result.canon.folderName}/SKILL.md`]).toBe(
      result.canon.markdown,
    );
    expect(result.bundle.files["INSTALL.md"]).toBeTruthy();
    expect(result.bundle.files["evals/cases.json"]).toBeTruthy();

    const checkResult = await check(result.canon, result.bundle, adapter);
    expect(checkResult.lint.ok).toBe(true);
    expect(checkResult.model).toBe("fake");
    expect(checkResult.judge.status).toBe("available");
  }
});

function exampleNamed(title: string) {
  const example = examples.find((item) => item.title === title);
  if (!example) {
    throw new Error(`missing Example: ${title}`);
  }
  return example;
}

function mustNotPattern(title: string): RegExp {
  if (title === "PR review") {
    return /did not touch/i;
  }
  if (title === "DB migration") {
    return /drop/i;
  }
  if (title === "release notes") {
    return /invent/i;
  }
  throw new Error(`unexpected Example: ${title}`);
}

test("each Example ships Eval Cases that include at least one must-not case", async () => {
  for (const example of examples) {
    const result = await compile(example.description, createFakeModelAdapter());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`expected ${example.title} to compile`);
    }

    const evalCases: Array<{ mustNot: string[] }> = JSON.parse(
      result.bundle.files["evals/cases.json"],
    );
    const mustNots = evalCases.flatMap((evalCase) => evalCase.mustNot);
    expect(mustNots.length).toBeGreaterThan(0);
    expect(mustNots.join("\n")).toMatch(mustNotPattern(example.title));
  }
});

test("DB migration Example Skill Spec keeps expand/contract and forbids reckless drops", async () => {
  const result = await compile(
    exampleNamed("DB migration").description,
    createFakeModelAdapter(),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected DB migration Example to compile");
  }
  expect(result.skillSpec.invariants.join("\n")).toMatch(/expand\/contract/i);
  expect(result.skillSpec.invariants.join("\n")).toMatch(/drop/i);
});

test("release notes Example Skill Spec forbids inventing features not in the log", async () => {
  const result = await compile(
    exampleNamed("release notes").description,
    createFakeModelAdapter(),
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected release notes Example to compile");
  }
  expect(result.skillSpec.antiGoals.join("\n")).toMatch(/invent/i);
});

test("edited Example Description compiles through the model adapter, not the Example seeds", async () => {
  const example = exampleNamed("DB migration");

  const adapter: ModelAdapter = {
    generateSkillSpec: async () => ({
      when: "When the edited Description applies",
      invariants: ["Edited invariant"],
      antiGoals: ["Edited anti-goal"],
    }),
    generateCanon: async () => ({
      name: "edited-skill",
      description: "Edited Description",
      body: "Honor the edited contract.",
    }),
    generateEvalCases: async () => [
      {
        scenario: "Edited scenario",
        must: ["Follow the edited Description"],
        mustNot: ["Keep the Example seeds"],
      },
    ],
  };

  const result = await compile(
    `${example.description} Also mention rollback.`,
    adapter,
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected edited Example Description to compile");
  }
  expect(result.skillSpec).toEqual({
    when: "When the edited Description applies",
    invariants: ["Edited invariant"],
    antiGoals: ["Edited anti-goal"],
  });
  expect(JSON.parse(result.bundle.files["evals/cases.json"])).toEqual([
    {
      scenario: "Edited scenario",
      must: ["Follow the edited Description"],
      mustNot: ["Keep the Example seeds"],
    },
  ]);
});

function openaiChatResponse(payload: unknown): Response {
  return openaiChatContent(JSON.stringify(payload));
}

function openaiChatContent(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "demo-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function geminiUnavailableResponse(): Response {
  return new Response(
    JSON.stringify([
      {
        error: {
          code: 503,
          message:
            "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
          status: "UNAVAILABLE",
        },
      },
    ]),
    {
      status: 503,
      headers: { "content-type": "application/json" },
    },
  );
}

test("OpenAI-compatible adapter skips the ngrok free interstitial", async () => {
  const headers: string[] = [];
  const adapter = createOpenAICompatibleAdapter({
    baseURL: "https://demo.ngrok-free.dev/v1",
    apiKey: "server-key",
    model: "demo-flash",
    fetch: async (_input, init) => {
      headers.push(new Headers(init?.headers).get("ngrok-skip-browser-warning") ?? "");
      return openaiChatResponse({
        when: "When reviewing a PR",
        invariants: ["Require tests"],
        antiGoals: ["Do not rewrite the diff"],
      });
    },
  });

  await adapter.generateSkillSpec("A skill that reviews pull requests.");

  expect(headers).toEqual(["1"]);
});

test("OpenAI-compatible adapter asks Ollama for JSON and lower temperature", async () => {
  let body: { response_format?: { type?: string }; temperature?: number } = {};
  const adapter = createOpenAICompatibleAdapter({
    baseURL: "https://models.example/v1",
    apiKey: "server-key",
    model: "demo-flash",
    fetch: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return openaiChatResponse({
        when: "When reviewing a PR",
        invariants: ["Require tests"],
        antiGoals: ["Do not rewrite the diff"],
      });
    },
  });

  await adapter.generateSkillSpec("A skill that reviews pull requests.");

  expect(body.response_format).toEqual({ type: "json_object" });
  expect(body.temperature).toBe(0.2);
});

test("OpenAI-compatible adapter extracts JSON from surrounding prose", async () => {
  const adapter = createOpenAICompatibleAdapter({
    baseURL: "https://models.example/v1",
    apiKey: "server-key",
    model: "demo-flash",
    fetch: async () =>
      openaiChatContent(
        'Sure, here you go:\n{"when":"When reviewing a PR","invariants":["Require tests"],"antiGoals":["Do not rewrite the diff"]}\n',
      ),
  });

  await expect(
    adapter.generateSkillSpec("A skill that reviews pull requests."),
  ).resolves.toEqual({
    when: "When reviewing a PR",
    invariants: ["Require tests"],
    antiGoals: ["Do not rewrite the diff"],
  });
});

test("OpenAI-compatible adapter unwraps Eval Cases from a JSON object", async () => {
  const adapter = createOpenAICompatibleAdapter({
    baseURL: "https://models.example/v1",
    apiKey: "server-key",
    model: "demo-flash",
    fetch: async () =>
      openaiChatResponse({
        cases: [
          {
            scenario: "A PR adds a feature with no tests",
            must: ["Ask for tests"],
            must_not: ["Rewrite unrelated files"],
          },
        ],
      }),
  });

  await expect(
    adapter.generateEvalCases({
      description: "A skill that reviews pull requests.",
      skillSpec: {
        when: "When reviewing a PR",
        invariants: ["Require tests"],
        antiGoals: ["Do not rewrite the diff"],
      },
    }),
  ).resolves.toEqual([
    {
      scenario: "A PR adds a feature with no tests",
      must: ["Ask for tests"],
      mustNot: ["Rewrite unrelated files"],
    },
  ]);
});

test("compile through an OpenAI-compatible adapter uses baseURL, apiKey, and model", async () => {
  const payloads = [
    prReviewSkillSpec,
    prReviewCanon,
    prReviewEvalCases,
  ];
  const requests: Array<{ url: string; authorization: string; model: string }> =
    [];
  const adapter = createOpenAICompatibleAdapter({
    baseURL: "https://models.example/v1",
    apiKey: "server-key",
    model: "demo-flash",
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        authorization: headers.get("authorization") ?? "",
        model: JSON.parse(String(init?.body)).model,
      });
      const payload = payloads.shift();
      if (payload === undefined) {
        throw new Error("unexpected extra model request");
      }
      return openaiChatResponse(payload);
    },
  });

  const result = await compile(
    "A skill that reviews pull requests for missing tests.",
    adapter,
  );

  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("expected compile through the OpenAI-compatible adapter");
  }
  expect(result.skillSpec).toEqual(prReviewSkillSpec);
  expect(result.canon.name).toBe("pr-review");
  expect(JSON.parse(result.bundle.files["evals/cases.json"])).toEqual(
    prReviewEvalCases,
  );
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(request.url.startsWith("https://models.example/v1/")).toBe(true);
    expect(request.authorization).toBe("Bearer server-key");
    expect(request.model).toBe("demo-flash");
  }
});

test(
  "compile retries a transient 503 and succeeds",
  async () => {
    const payloads = [prReviewCanon];
    let attempts = 0;
    const adapter = createOpenAICompatibleAdapter({
      baseURL: "https://models.example/v1",
      apiKey: "server-key",
      model: "demo-flash",
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) {
          return geminiUnavailableResponse();
        }
        const payload = payloads.shift();
        if (payload === undefined) {
          throw new Error("unexpected extra model request");
        }
        return openaiChatResponse(payload);
      },
    });

    const result = await compile(exampleNamed("PR review").description, adapter);

    expect(result.ok, result.ok ? "ok" : result.message).toBe(true);
    expect(attempts).toBe(2);
  },
  15_000,
);

test("compile surfaces a busy message when the model returns 503", async () => {
  const result = await compile(
    exampleNamed("PR review").description,
    createOpenAICompatibleAdapter({
      baseURL: "https://models.example/v1",
      apiKey: "server-key",
      model: "demo-flash",
      maxRetries: 0,
      fetch: async () => geminiUnavailableResponse(),
    }),
  );

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject a 503");
  }
  expect(result.message).toBe(
    "The model is busy. Try again, or paste your own API key.",
  );
});

test(
  "compile still surfaces a busy message after 503 retries are exhausted",
  async () => {
    const result = await compile(
      exampleNamed("PR review").description,
      createOpenAICompatibleAdapter({
        baseURL: "https://models.example/v1",
        apiKey: "server-key",
        model: "demo-flash",
        maxRetries: 1,
        fetch: async () => geminiUnavailableResponse(),
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected compile to reject a persistent 503");
    }
    expect(result.message).toBe(
      "The model is busy. Try again, or paste your own API key.",
    );
  },
  15_000,
);

test("compile surfaces a rate-limit message when the model returns 429", async () => {
  const result = await compile(
    exampleNamed("PR review").description,
    createOpenAICompatibleAdapter({
      baseURL: "https://models.example/v1",
      apiKey: "server-key",
      model: "demo-flash",
      maxRetries: 0,
      fetch: async () =>
        new Response("quota exceeded", {
          status: 429,
          headers: { "content-type": "text/plain" },
        }),
    }),
  );

  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("expected compile to reject a 429");
  }
  expect(result.message).toBe(
    "The model hit a rate limit. Try again, or paste your own API key.",
  );
});

test("Check leaves Lint in place when the OpenAI-compatible adapter hits a quota response", async () => {
  const compiled = await compilePrReview();

  expect(compiled.ok).toBe(true);
  if (!compiled.ok) {
    throw new Error("expected compile to return a Canon and Bundle");
  }

  const result = await check(
    compiled.canon,
    compiled.bundle,
    createOpenAICompatibleAdapter({
      baseURL: "https://models.example/v1",
      apiKey: "server-key",
      model: "demo-flash",
      maxRetries: 0,
      fetch: async () =>
        new Response("quota exceeded", {
          status: 429,
          headers: { "content-type": "text/plain" },
        }),
    }),
  );

  expect(result.lint.ok).toBe(true);
  expect(result.lint.issues).toEqual([]);
  expect(result.judge).toEqual({ status: "unavailable" });
});

function openaiCompatibleFetch(payloads: unknown[]) {
  const requests: Array<{ url: string; authorization: string; model: string }> =
    [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(input),
      authorization: headers.get("authorization") ?? "",
      model: JSON.parse(String(init?.body)).model,
    });
    const payload = payloads.shift();
    if (payload === undefined) {
      throw new Error("unexpected extra model request");
    }
    return openaiChatResponse(payload);
  };
  return { fetch: fetchImpl, requests };
}

const openaiCompatibleConfig = {
  baseURL: "https://models.example/v1",
  apiKey: "server-key",
  model: "demo-flash",
} as const;

test("a Visitor API key is used for that compile and does not consume the daily cap", async () => {
  const quota = createDailyQuota(1);
  const visitor = openaiCompatibleFetch([
    prReviewSkillSpec,
    prReviewCanon,
    prReviewEvalCases,
  ]);
  const visitorAdapter = resolveModelAdapter({
    ...openaiCompatibleConfig,
    visitorApiKey: " visitor-key ",
    quota,
    fetch: visitor.fetch,
  });

  expect(visitorAdapter.ok).toBe(true);
  if (!visitorAdapter.ok) {
    throw new Error("expected a Visitor API key to resolve an adapter");
  }

  const visitorResult = await compile(
    "A skill that reviews pull requests for missing tests.",
    visitorAdapter.adapter,
  );
  expect(visitorResult.ok).toBe(true);
  expect(visitor.requests.map((request) => request.authorization)).toEqual(
    visitor.requests.map(() => "Bearer visitor-key"),
  );

  const server = openaiCompatibleFetch([
    prReviewSkillSpec,
    prReviewCanon,
    prReviewEvalCases,
  ]);
  const serverAdapter = resolveModelAdapter({
    ...openaiCompatibleConfig,
    quota,
    fetch: server.fetch,
  });
  expect(serverAdapter.ok).toBe(true);
  if (!serverAdapter.ok) {
    throw new Error("expected the server key to still be under the daily cap");
  }

  const serverResult = await compile(
    "A skill that reviews pull requests for missing tests.",
    serverAdapter.adapter,
  );
  expect(serverResult.ok).toBe(true);
  expect(server.requests[0]?.authorization).toBe("Bearer server-key");
});

test("compile fails when the server key is over the daily cap and no Visitor API key is provided", async () => {
  const quota = createDailyQuota(1);
  const first = openaiCompatibleFetch([
    prReviewSkillSpec,
    prReviewCanon,
    prReviewEvalCases,
  ]);
  const firstAdapter = resolveModelAdapter({
    ...openaiCompatibleConfig,
    quota,
    fetch: first.fetch,
  });
  expect(firstAdapter.ok).toBe(true);
  if (!firstAdapter.ok) {
    throw new Error("expected the first server-key compile to resolve");
  }
  const firstResult = await compile(
    "A skill that reviews pull requests for missing tests.",
    firstAdapter.adapter,
  );
  expect(firstResult.ok).toBe(true);

  const capped = resolveModelAdapter({
    ...openaiCompatibleConfig,
    quota,
    fetch: first.fetch,
  });
  expect(capped).toEqual({
    ok: false,
    message:
      "The server key hit its daily cap. Paste your own API key to continue.",
  });

  const visitor = openaiCompatibleFetch([
    prReviewSkillSpec,
    prReviewCanon,
    prReviewEvalCases,
  ]);
  const visitorAdapter = resolveModelAdapter({
    ...openaiCompatibleConfig,
    visitorApiKey: "visitor-key",
    quota,
    fetch: visitor.fetch,
  });
  expect(visitorAdapter.ok).toBe(true);
  if (!visitorAdapter.ok) {
    throw new Error("expected a Visitor API key to compile after the daily cap");
  }
  const visitorResult = await compile(
    "A skill that reviews pull requests for missing tests.",
    visitorAdapter.adapter,
  );
  expect(visitorResult.ok).toBe(true);
});

test("compile asks for a Visitor API key when the server key is missing", () => {
  const resolved = resolveModelAdapter({
    ...openaiCompatibleConfig,
    apiKey: "  ",
    quota: createDailyQuota(1),
  });
  expect(resolved).toEqual({
    ok: false,
    message: "Paste an API key to compile.",
  });
});

test("the server daily cap resets on the next UTC day", () => {
  const quota = createDailyQuota(1);
  const first = resolveModelAdapter({
    ...openaiCompatibleConfig,
    quota,
    now: new Date("2026-09-15T23:00:00.000Z"),
  });
  expect(first.ok).toBe(true);

  const sameDay = resolveModelAdapter({
    ...openaiCompatibleConfig,
    quota,
    now: new Date("2026-09-15T23:59:00.000Z"),
  });
  expect(sameDay.ok).toBe(false);

  const nextDay = resolveModelAdapter({
    ...openaiCompatibleConfig,
    quota,
    now: new Date("2026-09-16T00:00:00.000Z"),
  });
  expect(nextDay.ok).toBe(true);
});
