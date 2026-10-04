import { getReputationConfiguration } from "@/db/queries/reputation";

import { ReputationSettings, type ReputationSection } from "./reputation-settings";

export async function ReputationSectionPage({ section }: { section: ReputationSection }) {
  const { enabledAt, levels, maxLockedLevel, rules, status, trusted } = await getReputationConfiguration();

  return (
    <ReputationSettings
      enabledAt={enabledAt?.toISOString() ?? null}
      initialConfig={{ levels, rules, trusted }}
      initialStatus={status}
      maxLockedLevel={maxLockedLevel}
      section={section}
    />
  );
}
