// Audience / Intent options for the "Deck to Video" workflow.
//
// The chosen audience steers the deck analysis: which slides are kept vs.
// excluded, the tone of the generated brief, the suggested duration, and a
// sensible default Video Format. The prompt-steering text lives server-side in
// deck-analysis-service.ts (AUDIENCE_GUIDANCE); this file is the shared contract
// (ids + display copy + default format) used by the client picker and to
// validate the incoming id on the server.

export type DeckAudienceId = 'marketing' | 'investor' | 'internal' | 'educational';

export interface DeckAudienceConfig {
  id: DeckAudienceId;
  label: string;
  /** Short helper copy shown under the option in the picker. */
  description: string;
  /** Default Video Format (project type id) suggested for this audience. */
  defaultFormat: string;
}

export const DECK_AUDIENCES: DeckAudienceConfig[] = [
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Punchy promo for customers & social. Keeps the most visual, emotional slides.',
    defaultFormat: 'youtube-ad',
  },
  {
    id: 'investor',
    label: 'Investor presentation',
    description: 'For investors & stakeholders. Keeps concept, vision, data & financial slides.',
    defaultFormat: 'product-launch',
  },
  {
    id: 'internal',
    label: 'Internal use',
    description: "For employees' knowledge. Keeps explanatory, process & concept slides.",
    defaultFormat: 'youtube-ad',
  },
  {
    id: 'educational',
    label: 'Educational',
    description: 'Teaching & training. Keeps step-by-step, explanatory & diagram slides.',
    defaultFormat: 'educational',
  },
];

export const DEFAULT_DECK_AUDIENCE_ID: DeckAudienceId = 'marketing';

export function getDeckAudience(id?: string | null): DeckAudienceConfig {
  return DECK_AUDIENCES.find((a) => a.id === id) || DECK_AUDIENCES[0];
}

export function isDeckAudienceId(id?: string | null): id is DeckAudienceId {
  return !!id && DECK_AUDIENCES.some((a) => a.id === id);
}
