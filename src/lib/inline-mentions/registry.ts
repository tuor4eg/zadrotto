export type MentionTriggerConfig = {
  trigger: string;
  entityTypes: readonly string[];
  searchEndpoint: string;
};

export const MENTION_TRIGGER_CONFIGS = {
  "@": {
    trigger: "@",
    entityTypes: ["title"],
    searchEndpoint: "/api/mentions/search",
  },
} as const satisfies Record<string, MentionTriggerConfig>;

export function getMentionTriggerConfig(trigger: string): MentionTriggerConfig | null {
  return Object.prototype.hasOwnProperty.call(MENTION_TRIGGER_CONFIGS, trigger)
    ? MENTION_TRIGGER_CONFIGS[trigger as keyof typeof MENTION_TRIGGER_CONFIGS]
    : null;
}
