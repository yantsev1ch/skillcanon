"use server";

import {
  check,
  compile,
  createFakeModelAdapter,
  type CheckResult,
  type CompileResult,
} from "@/compiler";

export type StudioResult =
  | (Extract<CompileResult, { ok: true }> & { check: CheckResult })
  | Extract<CompileResult, { ok: false }>;

export async function compileDescription(
  _previous: StudioResult | null,
  formData: FormData,
): Promise<StudioResult> {
  const description = String(formData.get("description") ?? "");
  const adapter = createFakeModelAdapter();
  const result = await compile(description, adapter);
  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    check: await check(result.canon, result.bundle, adapter),
  };
}
