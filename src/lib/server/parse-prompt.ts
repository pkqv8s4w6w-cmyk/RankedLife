import type { Activity } from '../types';

/** Compact catalogue the model matches against. Kept terse to keep tokens down. */
export function catalogueFor(activities: Activity[]): string {
  return activities
    .filter((a) => !a.archived)
    .map((a) => {
      const unit =
        a.kind === 'check'
          ? 'done/not done, amount is always 1'
          : a.kind === 'duration'
            ? 'amount in minutes'
            : a.kind === 'money'
              ? 'amount in dollars'
              : `amount in ${a.unit ?? 'units'}`;
      return `- id="${a.id}" | ${a.name} | ${a.polarity} | ${unit}`;
    })
    .join('\n');
}

export const SYSTEM_PROMPT = `You convert a person's plain-language description of their day into structured activity entries for a habit tracker.

Rules:
- Match each thing they mention to exactly one activity id from the catalogue. Do not invent ids.
- If something clearly happened but no catalogue entry fits, return it with activity_id set to null and fill in suggested_name and suggested_polarity so the app can offer to create it.
- Only include things the person actually did. Ignore plans, intentions and things they say they will do later ("I'm going to hit the gym tonight" is not an entry).
- If they mention something they failed to do or a habit they are trying to break, match it to a burn activity when one exists.
- Infer reasonable amounts when they are vague: "a quick gym session" is about 45 minutes, "studied for a bit" is about 30 minutes, "a couple hours" is 120. Lower your confidence when you are guessing.
- Never inflate. If they do not say how long, pick the modest end of the range.
- One entry per distinct occurrence. Two separate gym sessions are two entries.
- confidence is 0 to 1: 1 when they stated the activity and amount explicitly, around 0.5 when you inferred the amount, below 0.4 when you are unsure the activity happened at all.

Return an empty list if nothing in the message describes something they did.`;

export const TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          activity_id: {
            type: ['string', 'null'] as const,
            description: 'An id from the catalogue, or null if nothing fits.',
          },
          suggested_name: {
            type: ['string', 'null'] as const,
            description: 'Short name for a new activity, only when activity_id is null.',
          },
          suggested_polarity: {
            type: ['string', 'null'] as const,
            enum: ['build', 'burn', null],
            description: 'Whether the suggested new activity earns or costs points.',
          },
          amount: {
            type: 'number' as const,
            description: 'Amount in the activity’s own units. Use 1 for done/not-done activities.',
          },
          note: {
            type: ['string', 'null'] as const,
            description: 'Short verbatim detail worth keeping, or null.',
          },
          confidence: { type: 'number' as const, description: '0 to 1.' },
        },
        required: ['activity_id', 'suggested_name', 'suggested_polarity', 'amount', 'note', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};
