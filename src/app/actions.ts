"use server";

import {
  compile,
  createFakeModelAdapter,
  type CompileResult,
} from "@/compiler";

export async function compileDescription(
  _previous: CompileResult | null,
  formData: FormData,
): Promise<CompileResult> {
  const description = String(formData.get("description") ?? "");
  return compile(description, createFakeModelAdapter());
}
