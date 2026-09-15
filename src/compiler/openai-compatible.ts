import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { ModelAdapter } from "./index";

export type OpenAICompatibleAdapterConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
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
    fetch: config.fetch,
  });
  const model = provider.chatModel(config.model);

  return {
    model: config.model,
    generateSkillSpec(description) {
      return generateJson(
        model,
        `Produce a Skill Spec as JSON with keys when (string), invariants (string[]), and antiGoals (string[]). Each array needs at least one item. Write in the same language as the Description. Return JSON only.

Description:
${description}`,
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
      );
    },
    generateEvalCases({ description, skillSpec }) {
      return generateJson(
        model,
        `Produce Eval Cases as a JSON array of objects with keys scenario (string), must (string[]), and mustNot (string[]). Include at least one case. Write in the same language as the Description. Return JSON only.

Description:
${description}

Skill Spec:
${JSON.stringify(skillSpec)}`,
      );
    },
    judgeEvalCases({ canon, evalCases }) {
      return generateJson(
        model,
        `Score each Eval Case against the Canon. Return a JSON array, in the same order, of objects with keys verdict ("pass", "warn", or "fail") and comment (a short string). Return JSON only.

Canon:
${canon.markdown}

Eval Cases:
${JSON.stringify(evalCases)}`,
      );
    },
  };
}

async function generateJson(
  model: Parameters<typeof generateText>[0]["model"],
  prompt: string,
): Promise<unknown> {
  const { text } = await generateText({ model, prompt, maxRetries: 0 });
  return parseJsonValue(text);
}

function parseJsonValue(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}
