import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { levelSettings } from "@/db/schema";
import { appendDomainEvents } from "@/lib/domain-events/persistence";
import { historicalReputationFactsSql } from "./historical-sql";

const REPUTATION_SYSTEM_LOCK = 90_420_261;

export async function initializeReputation() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${REPUTATION_SYSTEM_LOCK})`);
    const [settings] = await tx.select({ status: levelSettings.status }).from(levelSettings)
      .where(eq(levelSettings.id, 1)).limit(1).for("update");
    if (!settings || settings.status !== "initializing") {
      throw new Error("Reputation initialization was not requested.");
    }

    await tx.execute(sql`
      with historical_facts as (${historicalReputationFactsSql()})
      insert into author_action_ledger (
        author_id, action_code, entry_kind, source_type, source_key, idempotency_key, reward_key,
        xp_delta, trust_delta, outcome, occurred_at
      )
      select facts.author_id, facts.action_code, 'reward', facts.source_type, facts.source_key,
        'reward:' || facts.action_code || ':' || facts.author_id || ':' || facts.source_type || ':' || facts.source_key,
        facts.action_code || ':' || facts.author_id || ':' || facts.source_type || ':' || facts.source_key,
        xp.xp, case when trust.counts_toward_trust then trust.trust_points else 0 end, null, facts.occurred_at
      from historical_facts facts
      inner join authors on authors.id = facts.author_id and authors.is_system = false
      inner join xp_action_rules xp on xp.action_code = facts.action_code
      inner join trust_action_rules trust on trust.action_code = facts.action_code
      where facts.outcome <> 'rejected'
      on conflict (idempotency_key) do nothing
    `);
    await tx.execute(sql`
      with outcomes as (${historicalReputationFactsSql()})
      insert into author_action_ledger (
        author_id, action_code, entry_kind, source_type, source_key, idempotency_key,
        xp_delta, trust_delta, outcome, occurred_at
      )
      select outcomes.author_id, outcomes.action_code, 'outcome', outcomes.source_type, outcomes.source_key,
        'historical:outcome:' || outcomes.outcome || ':' || outcomes.action_code || ':' || outcomes.author_id || ':' || outcomes.source_type || ':' || outcomes.source_key,
        0, 0, outcomes.outcome, outcomes.occurred_at
      from outcomes inner join authors on authors.id = outcomes.author_id and authors.is_system = false
      inner join trust_action_rules rules on rules.action_code = outcomes.action_code and rules.counts_toward_trust
      on conflict (idempotency_key) do nothing
    `);

    await tx.execute(sql`
      insert into author_progress (author_id, xp_total, current_level, max_achieved_level, initialized_at, created_at, updated_at)
      select authors.id, coalesce(sum(ledger.xp_delta), 0)::int,
        coalesce((select max(level) from level_thresholds where xp_threshold <= coalesce(sum(ledger.xp_delta), 0)), 1)::int,
        coalesce((select max(level) from level_thresholds where xp_threshold <= coalesce(sum(ledger.xp_delta), 0)), 1)::int,
        now(), now(), now()
      from authors left join author_action_ledger ledger on ledger.author_id = authors.id
      where authors.is_system = false group by authors.id
      on conflict (author_id) do update set
        xp_total = excluded.xp_total,
        current_level = greatest(author_progress.current_level, excluded.current_level),
        max_achieved_level = greatest(author_progress.max_achieved_level, excluded.max_achieved_level),
        updated_at = now()
    `);
    await tx.execute(sql`
      insert into author_trust (
        author_id, trust_points, successful_outcomes, rejected_outcomes,
        first_qualifying_action_at, created_at, updated_at
      )
      select authors.id,
        coalesce(sum(ledger.trust_delta), 0)::int,
        coalesce(count(*) filter (where ledger.entry_kind = 'outcome' and ledger.outcome in ('published', 'approved')), 0)::int,
        coalesce(count(*) filter (where ledger.entry_kind = 'outcome' and ledger.outcome = 'rejected'), 0)::int,
        min(ledger.occurred_at) filter (where ledger.entry_kind = 'outcome'), now(), now()
      from authors
      left join author_action_ledger ledger on ledger.author_id = authors.id
      left join trust_action_rules rules on rules.action_code = ledger.action_code
      where authors.is_system = false group by authors.id
      on conflict (author_id) do update set
        trust_points = excluded.trust_points,
        successful_outcomes = excluded.successful_outcomes,
        rejected_outcomes = excluded.rejected_outcomes,
        first_qualifying_action_at = excluded.first_qualifying_action_at,
        updated_at = now()
    `);
    await tx.execute(sql`
      update level_settings set max_locked_level = greatest(
        max_locked_level, coalesce((select max(max_achieved_level) from author_progress), 0)
      ), updated_at = now() where id = 1
    `);
    const promotedRows = await tx.execute(sql`
      with candidate as (
        select authors.id, trusted_profile.id as trusted_profile_id
        from authors
        inner join author_access_profiles current_profile on current_profile.id = authors.access_profile_id and current_profile.code = 'regular'
        cross join author_access_profiles trusted_profile
        inner join author_progress progress on progress.author_id = authors.id
        inner join author_trust trust on trust.author_id = authors.id
        cross join trust_settings settings
        where trusted_profile.code = 'trusted' and settings.id = 1 and settings.auto_promotion_enabled
          and authors.blocked_at is null and trust.auto_trust_suppressed_at is null
          and progress.current_level >= settings.minimum_level
          and trust.trust_points >= settings.minimum_trust_points
          and trust.successful_outcomes + trust.rejected_outcomes > 0
          and trust.successful_outcomes * 100.0 / (trust.successful_outcomes + trust.rejected_outcomes) >= settings.minimum_approval_rate_percent
          and trust.first_qualifying_action_at <= now() - make_interval(days => settings.minimum_history_days)
      ), promoted as (
        update authors set access_profile_id = candidate.trusted_profile_id, updated_at = now()
        from candidate where authors.id = candidate.id returning authors.id
      )
      update author_trust set auto_trusted_at = coalesce(auto_trusted_at, now()), updated_at = now()
      where author_id in (select id from promoted)
      returning author_id as "authorId"
    `);
    const promoted = Array.from(promotedRows as Iterable<{ authorId: number }>);
    await appendDomainEvents(tx, promoted.map((row) => ({
      actorAuthorId: null,
      aggregateId: String(row.authorId),
      aggregateType: "author",
      payload: { authorId: row.authorId },
      type: "author.trusted-granted" as const,
    })));
    await tx.update(levelSettings).set({ enabledAt: new Date(), status: "enabled", updatedAt: new Date() })
      .where(eq(levelSettings.id, 1));
  });
}

export async function lockReputationForConsumer(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  await tx.execute(sql`select pg_advisory_xact_lock_shared(${REPUTATION_SYSTEM_LOCK})`);
}
