// Synced from keyway/src/features/house-rules/schema.ts by `npm run sync:domain`. Edit it there, not here.
import { z } from "zod";

export const ruleDocumentSchema = z.object({
  id: z.string(),
  buildingId: z.string(),
  title: z.string(),
  effectiveDate: z.iso.date(),
  version: z.number().int(),
});
export type RuleDocument = z.infer<typeof ruleDocumentSchema>;

export const rulePassageSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  buildingId: z.string(),
  section: z.string(),
  title: z.string(),
  text: z.string(),
});
export type RulePassage = z.infer<typeof rulePassageSchema>;

/** GET /api/rules: a building's rules document with its passages in section order. */
export const rulesSchema = z.object({
  document: ruleDocumentSchema,
  passages: z.array(rulePassageSchema),
});
export type Rules = z.infer<typeof rulesSchema>;

/** Orders "2.1" before "10.1" (section numbers compared part by part). */
export function compareSections(a: string, b: string) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export const rulesQuestionSchema = z.object({
  buildingId: z.string(),
  question: z
    .string()
    .trim()
    .min(3, "Ask a slightly longer question.")
    .max(300, "Keep questions under 300 characters."),
});

export const assistantAnswerSchema = z.object({
  mode: z.enum(["retrieval", "claude"]),
  answer: z.string(),
  citations: z.array(
    z.object({
      n: z.number().int(),
      passageId: z.string(),
      section: z.string(),
      title: z.string(),
      documentTitle: z.string(),
      excerpt: z.string(),
    }),
  ),
  answered: z.boolean(),
});
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;
