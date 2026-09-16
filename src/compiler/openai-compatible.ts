import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { ModelAdapter } from "./index";

export type OpenAICompatibleAdapterConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  maxRetries?: number;
};

export type DailyQuota = {
  tryConsume(now?: Date): boolean;
};

export type AdapterResolution =
  | { ok: true; adapter: ModelAdapter }
  | { ok: false; message: string };

export function createDailyQuota(limit: number): DailyQuota {
  let day = "";
  let count = 0;
  return {
    tryConsume(now = new Date()) {
      const utcDay = now.toISOString().slice(0, 10);
      if (utcDay !== day) {
        day = utcDay;
        count = 0;
      }
      if (count >= limit) {
        return false;
      }
      count += 1;
      return true;
    },
  };
}

export function resolveModelAdapter(
  input: OpenAICompatibleAdapterConfig & {
    visitorApiKey?: string;
    quota: DailyQuota;
    now?: Date;
  },
): AdapterResolution {
  if (input.baseURL.trim() === "" || input.model.trim() === "") {
    return {
      ok: false,
      message: "The model is not configured.",
    };
  }

  const visitorApiKey = input.visitorApiKey?.trim() ?? "";
  if (visitorApiKey !== "") {
    return {
      ok: true,
      adapter: createOpenAICompatibleAdapter({
        ...input,
        apiKey: visitorApiKey,
      }),
    };
  }

  if (input.apiKey.trim() === "") {
    return {
      ok: false,
      message: "Paste an API key to compile.",
    };
  }

  if (!input.quota.tryConsume(input.now)) {
    return {
      ok: false,
      message:
        "The server key hit its daily cap. Paste your own API key to continue.",
    };
  }

  return {
    ok: true,
    adapter: createOpenAICompatibleAdapter(input),
  };
}

export function createOpenAICompatibleAdapter(
  config: OpenAICompatibleAdapterConfig,
): ModelAdapter {
  const provider = createOpenAICompatible({
    name: "skillcanon",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    fetch: wrapFetch(config.baseURL, config.fetch),
  });
  const model = provider.chatModel(config.model);
  const maxRetries = config.maxRetries ?? 2;

  return {
    model: config.model,
    generateSkillSpec(description) {
      return generateJson(
        model,
        `Return JSON only, no markdown. Keys: when (string), invariants (string[]), antiGoals (string[]). Each array has at least one short item. Same language as the Description.

Example:
{"when":"When the user asks to review a pull request","invariants":["Require tests for behavior changes"],"antiGoals":["Do not rewrite unrelated files"]}

Description:
${description}`,
        maxRetries,
      );
    },
    generateCanon({ description, skillSpec }) {
      return generateJson(
        model,
        `Produce a Canon as JSON with keys name, description, and body. name is a Skill identifier: lowercase letters, digits, and hyphens, max 64 characters. description is at most 1024 characters. body is markdown instructions without YAML frontmatter. Use only portable fields. Write in the same language as the Description. Return JSON only.

Description:
${description}

Skill Spec:
${JSON.stringify(skillSpec)}`,
        maxRetries,
      );
    },
    generateEvalCases({ description, skillSpec }) {
      return generateJson(
        model,
        `Return JSON only, no markdown. Shape: {"cases":[{ "scenario": string, "must": string[], "mustNot": string[] }]}. At least one case. Same language as the Description.

Example:
{"cases":[{"scenario":"A PR adds a feature with no tests","must":["Ask for tests"],"mustNot":["Rewrite unrelated files"]}]}

Description:
${description}

Skill Spec:
${JSON.stringify(skillSpec)}`,
        maxRetries,
      ).then(unwrapEvalCases);
    },
    judgeEvalCases({ canon, evalCases }) {
      return generateJson(
        model,
        `Return JSON only, no markdown. Shape: {"results":[{ "verdict": "pass"|"warn"|"fail", "comment": string }]}. Same order as Eval Cases.

Example:
{"results":[{"verdict":"pass","comment":"Canon requires tests for new behavior."}]}

Canon:
${canon.markdown}

Eval Cases:
${JSON.stringify(evalCases)}`,
        maxRetries,
      ).then(unwrapJudgeResults);
    },
  };
}

function wrapFetch(
  baseURL: string,
  inner: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (isNgrok(baseURL) || isNgrok(String(input))) {
      headers.set("ngrok-skip-browser-warning", "1");
    }

    let body = init?.body;
    if (typeof body === "string") {
      try {
        const payload = JSON.parse(body) as Record<string, unknown>;
        if (payload.response_format == null) {
          payload.response_format = { type: "json_object" };
        }
        if (payload.temperature == null) {
          payload.temperature = 0.2;
        }
        body = JSON.stringify(payload);
        headers.delete("content-length");
      } catch {
        // leave the original body
      }
    }

    return inner(input, { ...init, headers, body });
  };
}

function isNgrok(value: string): boolean {
  return /ngrok/i.test(value);
}

function unwrapEvalCases(value: unknown): unknown {
  const list = asList(value, ["cases", "evalCases", "evals"]);
  if (list === undefined) {
    return value;
  }
  return list.map(normalizeEvalCase);
}

function unwrapJudgeResults(value: unknown): unknown {
  const list = asList(value, ["results", "scores", "cases"]);
  if (list === undefined) {
    return value;
  }
  return list.map(normalizeJudgeResult);
}

function asList(value: unknown, keys: string[]): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) {
        return record[key];
      }
    }
    if ("scenario" in record || "verdict" in record) {
      return [record];
    }
  }
  return undefined;
}

function normalizeEvalCase(item: unknown): unknown {
  if (item === null || typeof item !== "object") {
    return item;
  }
  const record = item as Record<string, unknown>;
  const must = record.must ?? record.should;
  const mustNot = record.mustNot ?? record.must_not ?? record.mustnot;
  return {
    scenario: stringOrUndefined(record.scenario) ?? stringOrUndefined(record.name),
    must: asStringList(must),
    mustNot: asStringList(mustNot),
  };
}

function normalizeJudgeResult(item: unknown): unknown {
  if (item === null || typeof item !== "object") {
    return item;
  }
  const record = item as Record<string, unknown>;
  return {
    verdict: record.verdict,
    comment: stringOrUndefined(record.comment) ?? stringOrUndefined(record.reason),
  };
}

function asStringList(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return [value];
  }
  return value;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

async function generateJson(
  model: Parameters<typeof generateText>[0]["model"],
  prompt: string,
  maxRetries: number,
): Promise<unknown> {
  const { text } = await generateText({ model, prompt, maxRetries });
  return parseJsonValue(text);
}

function parseJsonValue(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const candidates = [trimmed];
  const objectSlice = sliceBetween(trimmed, "{", "}");
  const arraySlice = sliceBetween(trimmed, "[", "]");
  if (objectSlice !== undefined) {
    candidates.push(objectSlice);
  }
  if (arraySlice !== undefined) {
    candidates.push(arraySlice);
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return text;
}

function sliceBetween(text: string, start: string, end: string): string | undefined {
  const from = text.indexOf(start);
  const to = text.lastIndexOf(end);
  if (from === -1 || to === -1 || to <= from) {
    return undefined;
  }
  return text.slice(from, to + 1);
}
