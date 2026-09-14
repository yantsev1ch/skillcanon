# Skillcanon

A studio that turns a Visitor's Description into a portable Skill, projects it for Cursor and Claude Code, and runs a Check.

## Artifact

**Skill**:
A folder that contains a SKILL.md and may bundle extra files, following the Agent Skills standard.
_Avoid_: prompt, rule, command, agent, plugin, pack

**SKILL.md**:
The markdown file with YAML frontmatter and instructions that an agent loads when the Skill is relevant.
_Avoid_: skill file, prompt file, system prompt

**Canon**:
The single portable Skill that is the source of truth. Projections copy it; they do not fork it.
_Avoid_: master, source skill, original, generic skill

**Projection**:
The same Canon laid out in a runtime-specific directory. Only the path changes (Cursor or Claude Code).
_Avoid_: export, adapter, port, translation, flavor

**Bundle**:
The zip a Visitor downloads: Cursor Projection, Claude Projection, INSTALL.md, and evals/cases.json.
_Avoid_: package, artifact, archive, export

**Skill Spec**:
The contract produced from a Description before SKILL.md exists: when it applies, invariants, and anti-goals.
_Avoid_: spec, brief, prompt, requirements, PRD

## Flow

**Visitor**:
Anyone using the public site without an account.
_Avoid_: user, customer, guest, developer

**Description**:
The free-text input that starts generation.
_Avoid_: prompt, query, request

**Example**:
One of the three baked starting points: PR review, DB migration, release notes.
_Avoid_: template, preset, demo, sample

**Compatibility Report**:
Which Agent Skills fields this Canon will honor or ignore on Cursor vs Claude Code.
_Avoid_: matrix, compatibility matrix, linter report

**Check**:
The screen that always runs Lint and, when a model is available, the Judge.
_Avoid_: eval, evaluation, test run, QA, playground

**Lint**:
Deterministic checks on Canon and Bundle shape that do not call a model.
_Avoid_: validation, static analysis, schema check

**Judge**:
An LLM-as-judge pass over Eval Cases. If the model is down, Check still shows Lint.
_Avoid_: evaluator, grader, benchmark, scorer

**Eval Case**:
A hidden scenario with expected behavior (must / must not) used by the Judge.
_Avoid_: test, example, fixture, test case
