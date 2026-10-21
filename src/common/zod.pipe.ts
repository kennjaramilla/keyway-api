import { type PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { Problem } from "./problem.js";

/** 422 with field messages, the same `errors` map the mock API returns. */
export function validationProblem(error: z.ZodError) {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return new Problem(422, "Validation failed", "Some fields need attention.", { errors });
}

/** `@Body(new ZodPipe(schema))`: parse with the shared Zod schema or answer 422. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw validationProblem(parsed.error);
    return parsed.data;
  }
}
