"use server";

import {
  check,
  compile,
  createDailyQuota,
  resolveModelAdapter,
  type CheckResult,
  type CompileResult,
} from "@/compiler";

export type StudioResult =
  | (Extract<CompileResult, { ok: true }> & { check: CheckResult })
  | Extract<CompileResult, { ok: false }>;

const serverKeyQuota = createDailyQuota(studioDailyCap());

export async function compileDescription(
  _previous: StudioResult | null,
  formData: FormData,
): Promise<StudioResult> {
  const description = String(formData.get("description") ?? "");
  if (description.trim() === "") {
    const empty = await compile(description, {
      generateSkillSpec: async () => undefined,
      generateCanon: async () => undefined,
      generateEvalCases: async () => undefined,
    });
    if (empty.ok) {
      throw new Error("empty Description must not compile");
    }
    return empty;
  }

  const resolved = resolveModelAdapter({
    baseURL: process.env.SKILLCANON_MODEL_BASE_URL ?? "",
    apiKey: process.env.SKILLCANON_MODEL_API_KEY ?? "",
    model: process.env.SKILLCANON_MODEL_ID ?? "",
    visitorApiKey: String(formData.get("visitorApiKey") ?? ""),
    quota: serverKeyQuota,
  });
  if (!resolved.ok) {
    return resolved;
  }

  const result = await compile(description, resolved.adapter);
  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    check: await check(result.canon, result.bundle, resolved.adapter),
  };
}

function studioDailyCap(): number {
  const parsed = Number(process.env.SKILLCANON_DAILY_CAP ?? 20);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 20;
}
