import "./fixtures/server-runtime";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";
import { PgDialect } from "drizzle-orm/pg-core";

const testUrl = process.env.ACCOUNT_MERGE_TEST_DATABASE_URL;

test("account merge: isolated full-schema transactional integration", { skip: !testUrl, timeout: 120000 }, async (t) => {
  const schema = `account_merge_${process.pid}_${Date.now()}`;
  const url = new URL(testUrl!);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const oldUrl = process.env.DATABASE_URL;
  let close: (() => Promise<void>) | undefined;
  try {
    await client.unsafe(`create schema ${schema}`);
    for (const name of (await readdir("drizzle")).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      const sql = (await readFile(`drizzle/${name}`, "utf8"))
        .replaceAll('"public".', `"${schema}".`)
        .replaceAll(/\bpublic\./g, `${schema}.`);
      await client.begin(async (tx) => { await tx.unsafe(sql); });
    }
    process.env.DATABASE_URL = url.toString();
    const service = await import("../src/db/operations/account-merge");
    const { getDbClient } = await import("../src/db");
    close = () => getDbClient().end({ timeout: 2 });
    const [profile] = await client`insert into author_access_profiles(code,name) values ('merge-test','Merge test') returning id`;
    const [admin] = await client`insert into admin_users(login,password_hash) values ('merge-test','unused') returning id`;
    const revision = randomUUID();
    await client`insert into auth_provider_settings(provider_code,enabled,revision) values ('google',true,${revision}),('yandex',true,${revision})`;
    async function pair(provider = "google") {
      const suffix = randomUUID();
      const [a] = await client`insert into authors(code,name,access_profile_id) values (${`a-${suffix}`},'First',${profile.id}) returning id`;
      const [b] = await client`insert into authors(code,name,access_profile_id) values (${`b-${suffix}`},'Second',${profile.id}) returning id`;
      const subject = `subject-${suffix}`;
      await client`insert into author_auth_identities(author_id,provider,provider_subject) values (${b.id},${provider},${subject})`;
      const [session] = await client`insert into author_sessions(author_id,token_hash,auth_method,expires_at) values (${a.id},${randomUUID()},'password',now()+interval '1 day') returning id`;
      const input = { authorId: a.id as number, sessionId: session.id as number, provider, subject, configurationRevision: revision };
      const grant = await service.createAccountMergeGrant(input);
      return { a: a.id as number, b: b.id as number, input, ...grant };
    }
    const rejectsCode = (action: Promise<unknown>, code?: string) => assert.rejects(action, (error: unknown) => error instanceof service.AccountMergeError && (!code || error.code === code));

    await t.test("every author foreign key and polymorphic notification has an explicit policy", async () => {
      const references = await client`
        select cl.relname as table_name, att.attname as column_name
        from pg_constraint co join pg_class cl on cl.oid=co.conrelid
        join pg_namespace ns on ns.oid=cl.relnamespace
        join pg_attribute att on att.attrelid=cl.oid and att.attnum=any(co.conkey)
        where co.contype='f' and co.confrelid='authors'::regclass and ns.nspname=${schema}`;
      const covered = new Set(service.ACCOUNT_MERGE_POLICIES.map(policy => `${policy.table}.${policy.owner}`));
      // These references intentionally preserve history or implement the merge itself.
      for (const reference of [
        'admin_activity_logs.author_id', 'domain_events.actor_author_id',
        'author_friendships.second_author_id', 'author_friendships.requested_by_author_id',
        'authors.merged_into_author_id', 'account_merge_archive.source_author_id',
        'account_merge_grants.initiator_author_id', 'account_merge_grants.secondary_author_id',
        'account_merge_grants.result_author_id',
      ]) covered.add(reference);
      assert.deepEqual(references.map(r => `${r.table_name}.${r.column_name}`).filter(reference => !covered.has(reference)).sort(), []);
      assert.ok(covered.has('notifications.recipient_id'));
      const grantIndexes=await client`select indexname from pg_indexes where schemaname=${schema} and tablename='account_merge_grants'`;
      for (const expected of ['account_merge_grants_initiator_idx','account_merge_grants_secondary_idx','account_merge_grants_result_idx']) assert.ok(grantIndexes.some(index=>index.indexname===expected));
    });

    await t.test("zero tier-list reward survives replay, rule changes, merge and source deletion", async () => {
      const p = await pair();
      const { db } = await import("../src/db");
      const { applyReputationEvent } = await import("../src/lib/reputation/service");
      const { projectMergedAccountEvent } = await import("../src/lib/domain-events/merge-event");
      const { historicalReputationFactsSql } = await import("../src/lib/reputation/historical-sql");
      const [settings] = await client`select status from level_settings where id=1`;
      const [rule] = await client`select xp from xp_action_rules where action_code='tier-list.created'`;
      await client`update level_settings set status='enabled' where id=1`;
      await client`update xp_action_rules set xp=0 where action_code='tier-list.created'`;
      try {
        const [list] = await client`insert into tier_lists(author_id,title,configuration,distribution,client_creation_id)
          values(${p.b},'Черновик',${client.json({ schemaVersion: 1, levels: [{ id: 's', name: 'S', color: '#ffffff' }] })},${client.json({ s: [] })},${randomUUID()}) returning id,public_id`;
        const event = { id: randomUUID(), type: "tier-list.created" as const, actorAuthorId: p.b,
          aggregateType: "tier-list", aggregateId: String(list.id), occurredAt: new Date(), schemaVersion: 1,
          payload: { authorId: p.b, tierListId: list.id as number } };
        await client`insert into domain_events(id,type,actor_author_id,aggregate_type,aggregate_id,payload,occurred_at)
          values(${event.id},${event.type},${p.b},'tier-list',${event.aggregateId},${client.json(event.payload)},${event.occurredAt})`;
        const [incoming] = await client`select client_creation_id from tier_lists where id=${list.id}`;
        const [original] = await client`insert into tier_lists(author_id,title,configuration,distribution,client_creation_id)
          values(${p.a},'Другой импорт',${client.json({ schemaVersion: 1, levels: [{ id: 's', name: 'S', color: '#ffffff' }] })},${client.json({ s: [] })},${incoming.client_creation_id}) returning id,public_id`;
        await client`insert into tier_list_quota_events(author_id,kind) values(${p.b},'created')`;
        await db.transaction(tx => applyReputationEvent(tx, event));
        const [fact] = await client`select * from author_action_ledger where author_id=${p.b} and source_type='tier-list'`;
        assert.ok(fact);
        assert.equal(fact.xp_delta, 0);
        assert.equal(fact.trust_delta, 0);
        await client`update xp_action_rules set xp=9 where action_code='tier-list.created'`;
        await db.transaction(tx => applyReputationEvent(tx, event));
        const preview = await service.getAccountMergePreview({ ...p.input, grantId: p.grantId });
        await service.confirmAccountMerge({ ...p.input, grantId: p.grantId, primaryAuthorId: p.a, version: preview.version });
        assert.equal((await client`select author_id,public_id from tier_lists where id=${list.id}`)[0].author_id, p.a);
        assert.equal((await client`select public_id from tier_lists where id=${list.id}`)[0].public_id, list.public_id);
        assert.equal((await client`select public_id from tier_lists where id=${original.id}`)[0].public_id, original.public_id);
        assert.notEqual((await client`select client_creation_id from tier_lists where id=${list.id}`)[0].client_creation_id, incoming.client_creation_id);
        assert.equal((await client`select author_id from tier_list_quota_events where author_id=${p.a}`)[0].author_id, p.a);
        await client`delete from tier_lists where id=${list.id}`;
        const projected = await db.transaction(tx => projectMergedAccountEvent(tx, event));
        assert.ok(projected);
        await db.transaction(tx => applyReputationEvent(tx, projected));
        const facts = await client`select * from author_action_ledger where author_id=${p.a} and source_type='tier-list'`;
        assert.equal(facts.length, 1);
        assert.equal(facts[0].id, fact.id);
        assert.equal(facts[0].xp_delta, 0);
        assert.equal((await client`select xp_total from author_progress where author_id=${p.a}`)[0].xp_total, 0);
        const compiled = new PgDialect().sqlToQuery(historicalReputationFactsSql());
        const historical = await client.unsafe(compiled.sql, compiled.params as never[]);
        assert.equal(historical.filter(row => row.source_type === "tier-list" && row.source_key === String(list.id) && row.author_id === p.a).length, 1);
      } finally {
        await client`update level_settings set status=${settings.status} where id=1`;
        await client`update xp_action_rules set xp=${rule.xp} where action_code='tier-list.created'`;
      }
    });

    await t.test("grant is bound to the initiating account/session, expires and follows provider revision", async () => {
      const p = await pair();
      await rejectsCode(service.getAccountMergePreview({ ...p.input, grantId: p.grantId, authorId: p.b }));
      await rejectsCode(service.getAccountMergePreview({ ...p.input, grantId: p.grantId, sessionId: p.input.sessionId + 100000 }));
      await client`update account_merge_grants set expires_at=now()-interval '1 second' where id=${p.grantId}`;
      await rejectsCode(service.getAccountMergePreview({ ...p.input, grantId: p.grantId }));
      const fresh = await pair();
      await client`update auth_provider_settings set revision=${randomUUID()} where provider_code='google'`;
      await rejectsCode(service.getAccountMergePreview({ ...fresh.input, grantId: fresh.grantId }));
      await client`update auth_provider_settings set revision=${revision} where provider_code='google'`;
    });

    await t.test("fresh proof and merge are provider agnostic (Yandex)", async () => {
      const p=await pair('yandex');
      const preview=await service.getAccountMergePreview({...p.input,grantId:p.grantId,primaryAuthorId:p.b});
      const result=await service.confirmAccountMerge({...p.input,grantId:p.grantId,primaryAuthorId:p.b,version:preview.version});
      assert.equal(result.authorId,p.b);
      assert.equal((await client`select provider from author_auth_identities where author_id=${p.b}`)[0].provider,'yandex');
      const {deleteAuthorIfUnused}=await import('../src/db/queries/authors');
      assert.deepEqual(await deleteAuthorIfUnused(p.b),{status:'has-data'});
      assert.deepEqual(await deleteAuthorIfUnused(p.a),{status:'has-data'});
    });

    await t.test("stale preview is rejected; a failure after transfer rolls back all changes", async () => {
      const p = await pair();
      const preview = await service.getAccountMergePreview({ ...p.input, grantId: p.grantId });
      await client`update authors set name='Changed after preview' where id=${p.b}`;
      await rejectsCode(service.confirmAccountMerge({ ...p.input, grantId: p.grantId, primaryAuthorId:p.a, version:preview.version }), "stale");
      assert.equal((await client`select consumed_at from account_merge_grants where id=${p.grantId}`)[0].consumed_at,null);
      assert.equal((await client`select merged_into_author_id from authors where id=${p.b}`)[0].merged_into_author_id,null);
      await client`insert into author_accounts(author_id,login,normalized_login,password_hash,status) values (${p.a},${`a-${p.a}`},${`a-${p.a}`},'first','active'),(${p.b},${`b-${p.b}`},${`b-${p.b}`},'second','active')`;
      const fresh = await service.getAccountMergePreview({ ...p.input, grantId:p.grantId });
      await client.unsafe(`create function ${schema}.fail_merge_archive() returns trigger language plpgsql as $$ begin raise exception 'injected archive failure'; end $$;
        create trigger fail_merge_archive before insert on account_merge_archive for each row execute function ${schema}.fail_merge_archive()`);
      try {
        await assert.rejects(service.confirmAccountMerge({ ...p.input, grantId:p.grantId, primaryAuthorId:p.a, version:fresh.version }), (error: unknown) => error instanceof Error && error.cause instanceof Error && /injected archive failure/.test(error.cause.message));
        assert.equal((await client`select * from author_accounts where author_id in (${p.a},${p.b})`).length,2);
        assert.equal((await client`select consumed_at from account_merge_grants where id=${p.grantId}`)[0].consumed_at,null);
        assert.equal((await client`select merged_into_author_id from authors where id=${p.b}`)[0].merged_into_author_id,null);
      } finally { await client.unsafe('drop trigger fail_merge_archive on account_merge_archive'); }
    });

    await t.test("simultaneous confirmation commits one merge and one event", async () => {
      const p=await pair();
      const preview=await service.getAccountMergePreview({...p.input,grantId:p.grantId});
      const input={...p.input,grantId:p.grantId,primaryAuthorId:p.a,version:preview.version};
      const results=await Promise.allSettled([service.confirmAccountMerge(input),service.confirmAccountMerge(input)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const rejected=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
      assert.equal(rejected.reason.code,'session-changed');
      assert.equal((await client`select * from domain_events where type='author.accounts.merged' and payload->>'mergeId'=${p.grantId}`).length,1);
    });

    await t.test("worker writes and indirect review edits reject closed author references", async () => {
      const p=await pair();
      const [media]=await client`insert into media_items(code,title,media_type) values (${randomUUID()},'Closed author fixture','game') returning id`;
      await client`insert into ratings(media_item_id,author_id,score) values (${media.id},${p.b},80)`;
      const [review]=await client`insert into contributions(type,author_id,primary_media_item_id) values ('review',${p.b},${media.id}) returning id`;
      await client`insert into contribution_reviews(contribution_id,title,body) values (${review.id},'Review','Original')`;
      await client`update authors set merged_into_author_id=${p.a} where id=${p.b}`;
      await assert.rejects(client`update ratings set score=90 where author_id=${p.b}`);
      await assert.rejects(client`delete from ratings where author_id=${p.b}`);
      await assert.rejects(client`update contribution_reviews set body='Late worker edit' where contribution_id=${review.id}`);
      await assert.rejects(client`delete from contribution_reviews where contribution_id=${review.id}`);
      await assert.rejects(client`insert into notifications(recipient_type,recipient_id,type,title,body,entity_type,entity_id) values ('author',${p.b},'late','Late','Body','author',${String(p.b)})`);
    });

    for (const reverse of [false, true]) await t.test(`ratings, wishlist, credentials, sessions and friendships; primary=${reverse ? 'secondary' : 'initiator'}`, async () => {
      const p = await pair();
      const winner = reverse ? p.b : p.a;
      const loser = reverse ? p.a : p.b;
      const [media] = await client`insert into media_items(code,title,media_type) values (${randomUUID()},'Merge fixture','game') returning id`;
      const [part] = await client`insert into title_parts(media_item_id,type,number,sort_order) values (${media.id},'part',1,1) returning id`;
      await client`insert into ratings(media_item_id,author_id,score) values (${media.id},${winner},90),(${media.id},${loser},50)`;
      await client`insert into ratings(media_item_id,part_id,author_id,score) values (${media.id},${part.id},${loser},70)`;
      await client`insert into author_media_statuses(author_id,media_item_id,status) values (${loser},${media.id},'wanted')`;
      await client`insert into author_accounts(author_id,login,normalized_login,password_hash,status) values (${winner},${`winner-${winner}`},${`winner-${winner}`},'keep','active'),(${loser},${`loser-${loser}`},${`loser-${loser}`},'archive','active')`;
      const [friend] = await client`insert into authors(code,name,access_profile_id) values (${randomUUID()},'Friend',${profile.id}) returning id`;
      for (const id of [winner, loser]) await client`insert into author_friendships(first_author_id,second_author_id,requested_by_author_id,status,accepted_at) values (${Math.min(id,friend.id)},${Math.max(id,friend.id)},${id},'accepted',now())`;
      await client`insert into author_sessions(author_id,token_hash,auth_method,expires_at) values (${loser},${randomUUID()},'password',now()+interval '1 day')`;
      const ratingRows = await client`select id,author_id from ratings where media_item_id=${media.id} and part_id is null`;
      for (const rating of ratingRows) await client`insert into author_action_ledger(author_id,action_code,entry_kind,source_type,source_key,idempotency_key,reward_key,xp_delta,trust_delta,occurred_at) values (${rating.author_id},'rating.created','reward','rating',${String(rating.id)},${`old:${rating.id}`},${`reward:${rating.id}`},${rating.author_id===winner ? 15 : 100},${rating.author_id===winner ? 2 : 9},now())`;
      await client`insert into author_progress(author_id,xp_total,current_level,max_achieved_level) values (${loser},100,1,8)`;
      const [achievement]=await client`insert into achievements(code,name,mechanic) values (${randomUUID()},'Merge reward','ratings-count') returning id`;
      const [level]=await client`insert into achievement_levels(achievement_id,level,threshold) values (${achievement.id},1,1) returning id`;
      await client`insert into user_achievements(author_id,achievement_level_id,award_group_id) values (${winner},${level.id},${randomUUID()}),(${loser},${level.id},${randomUUID()})`;
      await client`insert into author_emails(author_id,email,normalized_email,verified_at,is_primary) values
        (${winner},${`winner-${winner}@example.test`},${`winner-${winner}@example.test`},now(),true),
        (${loser},${`loser-${loser}@example.test`},${`loser-${loser}@example.test`},now(),true),
        (${loser},${`unverified-${loser}@example.test`},${`unverified-${loser}@example.test`},null,false)`;
      await client`insert into personal_data_consents(author_id,version) values (${winner},'same-version'),(${loser},'same-version'),(${loser},'secondary-version')`;
      const winnerProfile=(await client`select name,avatar_object_key from authors where id=${winner}`)[0];
      await client`insert into author_auth_challenges(author_id,purpose,token_hash,expires_at) values (${loser},'reset_password',${randomUUID()},now()-interval '1 day')`;
      await client`insert into author_access_tokens(author_id,token_hash,label,created_by_admin_id) values (${loser},${randomUUID()},'Old token',${admin.id})`;
      const reviews: number[] = [];
      for (const id of [winner,loser]) {
        const [review] = await client`insert into contributions(type,author_id,primary_media_item_id,status) values ('review',${id},${media.id},'published') returning id`;
        reviews.push(review.id);
        await client`insert into contribution_reviews(contribution_id,title,body) values (${review.id},'Review','Original review body')`;
        await client`insert into review_reactions(review_id,user_id,type) values (${review.id},${friend.id},'like')`;
      }
      const survivingCrossReactedReviews: number[]=[];
      for (const [index,reviewAuthor] of [winner,loser].entries()) {
        const [otherMedia]=await client`insert into media_items(code,title,media_type) values (${randomUUID()},'Cross-account reaction fixture','game') returning id`;
        const [review]=await client`insert into contributions(type,author_id,primary_media_item_id,status) values ('review',${reviewAuthor},${otherMedia.id},'published') returning id`;
        survivingCrossReactedReviews.push(review.id);
        await client`insert into contribution_reviews(contribution_id,title,body) values (${review.id},'Surviving review','Original')`;
        const reactor=index===0 ? loser : winner;
        await client`insert into review_reactions(review_id,user_id,type) values (${review.id},${reactor},'like'),(${review.id},${friend.id},'like')`;
      }
      for (let attempt=0;attempt<2;attempt++) {
        const eventId=randomUUID();
        await client`insert into domain_events(id,type,actor_author_id,aggregate_type,aggregate_id,payload) values (${eventId},'review.rejected',${loser},'review',${String(reviews[1])},${client.json({authorId:loser,contributionId:reviews[1],mediaItemId:media.id})})`;
        await client`insert into author_action_ledger(author_id,action_code,entry_kind,source_type,source_key,source_event_id,idempotency_key,outcome,occurred_at) values (${loser},'review.published','outcome','review',${String(reviews[1])},${eventId},${`outcome:rejected:${eventId}`},'rejected',now())`;
      }
      for (const [index,authorId] of [winner,loser].entries()) {
        const sourceKey=String(reviews[index]);
        await client`insert into author_action_ledger(author_id,action_code,entry_kind,source_type,source_key,idempotency_key,outcome,occurred_at) values (${authorId},'review.published','outcome','review',${sourceKey},${`historical:outcome:rejected:review.published:${authorId}:review:${sourceKey}`},'rejected',now())`;
      }
      const primaryLedgerBefore=await client`select * from author_action_ledger where author_id=${winner} order by id`;
      await client`insert into author_auth_identities(author_id,provider,provider_subject) values (${p.a},'google',${`first-subject-${p.a}`})`;
      await client`insert into notifications(recipient_type,recipient_id,type,title,body,entity_type,entity_id) values ('author',${loser},'fixture','Author notice','Body','author',${String(loser)}),('admin',${loser},'fixture','Admin notice','Body','author',${String(loser)})`;
      if (!reverse) {
        const {historicalReputationFactsSql}=await import('../src/lib/reputation/historical-sql');
        const historical=new PgDialect().sqlToQuery(historicalReputationFactsSql());
        const plans={
          historicalFacts:await client.unsafe(`explain (analyze,buffers,format json) ${historical.sql}`,historical.params as never[]),
          ratings:await client`explain (analyze,buffers,format json) select to_jsonb(t) from ratings t where author_id in (${winner},${loser})`,
          ledger:await client`explain (analyze,buffers,format json) select to_jsonb(t) from author_action_ledger t where author_id in (${winner},${loser})`,
          reviews:await client`explain (analyze,buffers,format json) select to_jsonb(t) from review_reactions t where review_id in (select id from contributions where author_id in (${winner},${loser}))`,
          ratingMove:await client`explain (format json) update ratings set author_id=${winner} where author_id=${loser}`,
        };
        await writeFile('/tmp/account-merge-query-plans.json',JSON.stringify(plans,null,2));
      }
      const preview = await service.getAccountMergePreview({ ...p.input, grantId: p.grantId, primaryAuthorId: winner });
      assert.ok(preview.counts.filter(count=>['Реакции','Реакции, ставшие собственными'].includes(count.label)).reduce((sum,count)=>sum+count.conflicts,0)>=2);
      const request = { ...p.input, grantId: p.grantId, primaryAuthorId: winner, version: preview.version };
      const result = await service.confirmAccountMerge(request);
      assert.equal(result.authorId, winner);
      assert.ok(result.token);
      assert.deepEqual((await client`select author_id,score,part_id from ratings where media_item_id=${media.id} order by part_id nulls first`).map((r) => ({...r})), [{author_id:winner,score:90,part_id:null},{author_id:winner,score:70,part_id:part.id}]);
      assert.equal((await client`select * from author_media_statuses where author_id=${winner} and media_item_id=${media.id}`).length, 0);
      assert.equal((await client`select password_hash from author_accounts where author_id=${winner}`)[0].password_hash, 'keep');
      assert.equal((await client`select * from author_accounts where author_id=${loser}`).length, 0);
      assert.equal((await client`select * from author_sessions where author_id in (${winner},${loser}) and revoked_at is null`).length, 1);
      assert.equal((await client`select * from author_friendships where first_author_id=${Math.min(winner,friend.id)} and second_author_id=${Math.max(winner,friend.id)}`).length, 1);
      assert.equal((await client`select merged_into_author_id from authors where id=${loser}`)[0].merged_into_author_id,winner);
      assert.ok((await client`select * from account_merge_archive where merge_id=${p.grantId}`).length >= 2);
      assert.equal((await client`select * from contributions where author_id=${winner} and primary_media_item_id=${media.id} and type='review'`).length,1);
      assert.equal((await client`select * from contribution_reviews where contribution_id=${reviews[1]}`).length,0);
      assert.equal((await client`select * from review_reactions where review_id=${reviews[1]}`).length,0);
      assert.equal((await client`select * from review_reactions where review_id=${reviews[0]}`).length,1);
      assert.equal((await client`select r.review_id from review_reactions r join contributions c on c.id=r.review_id where r.user_id=c.author_id and c.author_id=${winner}`).length,0);
      for (const reviewId of survivingCrossReactedReviews) {
        assert.equal((await client`select author_id from contributions where id=${reviewId}`)[0].author_id,winner);
        assert.equal((await client`select user_id from review_reactions where review_id=${reviewId}`)[0].user_id,friend.id);
        assert.equal((await client`select * from review_reactions where review_id=${reviewId}`).length,1);
      }
      assert.equal((await client`select * from account_merge_archive where merge_id=${p.grantId} and table_name='review_reactions' and reason='merged-self-reaction'`).length,2);
      assert.equal((await client`select * from author_auth_identities where author_id=${winner} and provider='google'`).length,1);
      assert.equal((await client`select recipient_id from notifications where title='Author notice' and recipient_id=${winner}`).length,1);
      assert.equal((await client`select recipient_id from notifications where title='Admin notice' and recipient_id=${loser}`).length,1);
      assert.equal((await client`select * from author_action_ledger where author_id=${winner}`).length,5);
      const primaryIds=primaryLedgerBefore.map(row=>row.id);
      assert.deepEqual(await client`select * from author_action_ledger where id=any(${primaryIds}) order by id`,primaryLedgerBefore);
      assert.equal((await client`select xp_total,max_achieved_level from author_progress where author_id=${winner}`)[0].xp_total,15);
      assert.equal((await client`select max_achieved_level from author_progress where author_id=${winner}`)[0].max_achieved_level,8);
      assert.equal((await client`select trust_points from author_trust where author_id=${winner}`)[0].trust_points,2);
      assert.equal((await client`select rejected_outcomes from author_trust where author_id=${winner}`)[0].rejected_outcomes,4);
      assert.deepEqual((await client`select name,avatar_object_key from authors where id=${winner}`)[0],winnerProfile);
      assert.equal((await client`select * from author_emails where author_id=${winner}`).length,2);
      assert.equal((await client`select * from author_emails where author_id=${winner} and is_primary=true`).length,1);
      assert.equal((await client`select * from author_emails where author_id=${winner} and verified_at is null`).length,0);
      assert.equal((await client`select * from personal_data_consents where author_id=${winner} and revoked_at is null`).length,2);
      assert.equal((await client`select * from account_merge_archive where merge_id=${p.grantId} and table_name='personal_data_consents'`).length,2);
      assert.equal((await client`select * from user_achievements where author_id=${winner} and achievement_level_id=${level.id}`).length,1);
      const stats=(await client`select ratings_count,score_sum from media_item_rating_stats where media_item_id=${media.id}`)[0];
      assert.equal(stats.ratings_count,1);
      assert.equal(Number(stats.score_sum),90);
      const {db}=await import('../src/db');
      const {projectMergedAccountEvent}=await import('../src/lib/domain-events/merge-event');
      const discardedRating=ratingRows.find(r=>r.author_id===loser)!;
      const event={id:randomUUID(),type:'rating.created' as const,schemaVersion:1,occurredAt:new Date(),actorAuthorId:loser,aggregateType:'rating',aggregateId:String(discardedRating.id),payload:{authorId:loser,mediaItemId:media.id}};
      assert.equal(await db.transaction(tx=>projectMergedAccountEvent(tx,event)),null);
      const [retainedPart]=await client`select id from ratings where media_item_id=${media.id} and part_id=${part.id}`;
      const projected=await db.transaction(tx=>projectMergedAccountEvent(tx,{...event,aggregateId:String(retainedPart.id)}));
      assert.equal(projected?.actorAuthorId,winner);
      assert.equal((projected?.payload as {authorId:number}).authorId,winner);
      assert.equal(event.actorAuthorId,loser);
      const archiveCount = (await client`select * from account_merge_archive where merge_id=${p.grantId}`).length;
      await rejectsCode(service.confirmAccountMerge(request), 'session-changed');
      const [resultSession] = await client`select id from author_sessions where author_id=${winner} and revoked_at is null`;
      const retry = await service.confirmAccountMerge({...request, authorId:winner, sessionId:resultSession.id});
      assert.equal((await client`select * from account_merge_archive where merge_id=${p.grantId}`).length,archiveCount);
      assert.equal(retry.authorId,winner);
      assert.equal((await client`select * from author_sessions where author_id=${winner} and revoked_at is null`).length,1);
      await assert.rejects(client`insert into ratings(media_item_id,author_id,score) values (${media.id},${loser},60)`);
      await assert.rejects(client`update ratings set author_id=${loser} where author_id=${winner} and media_item_id=${media.id} and part_id is null`);
      await assert.rejects(client`update authors set name='Resurrected' where id=${loser}`);
      await assert.rejects(client`delete from authors where id=${loser}`);
      assert.ok((await client`delete from author_sessions where author_id=${loser} and revoked_at is not null returning id`).length>0);
      assert.equal((await client`delete from author_auth_challenges where author_id=${loser} and consumed_at is not null returning id`).length,1);
      assert.equal((await client`delete from author_access_tokens where author_id=${loser} and revoked_at is not null returning id`).length,1);

    });
    await t.test("empty secondary never touches 6510 primary facts or primary progress/trust", async () => {
      const p=await pair();
      await client`insert into author_action_ledger(author_id,action_code,entry_kind,source_type,source_key,idempotency_key,reward_key,xp_delta,trust_delta,occurred_at,created_at)
        select ${p.a},'media.published','reward','media-item',n::text,'untouched:'||${p.grantId}||':'||n,
          'untouched-reward:'||${p.grantId}||':'||n,1,1,'2020-01-01'::timestamptz,'2020-01-02'::timestamptz
        from generate_series(1,6510) n`;
      await client`insert into author_progress(author_id,xp_total,current_level,max_achieved_level,created_at,updated_at)
        values (${p.a},777,2,8,'2020-02-01','2020-02-02')`;
      await client`insert into author_trust(author_id,trust_points,successful_outcomes,rejected_outcomes,first_qualifying_action_at,auto_trusted_at,created_at,updated_at)
        values (${p.a},333,12,3,'2020-03-01','2020-03-02','2020-03-03','2020-03-04')`;
      await client.unsafe('analyze author_action_ledger');
      const semanticPlans={
        sum:await client`explain (analyze,buffers,format json) select
          coalesce(sum(xp_delta) filter (where entry_kind='reward'),0)::integer as xp,
          coalesce(sum(trust_delta) filter (where entry_kind='reward'),0)::integer as trust,
          count(*) filter (where entry_kind='outcome' and outcome<>'rejected')::integer as successes,
          count(*) filter (where entry_kind='outcome' and outcome='rejected')::integer as rejections,
          min(occurred_at) filter (where entry_kind='outcome') as first_outcome
          from author_action_ledger where author_id=${p.a}`,
        semantic:await client`explain (analyze,buffers,format json) select
          exists(select 1 from author_action_ledger where author_id=${p.a} and action_code='media.published' and source_type='media-item' and source_key='1' and entry_kind='reward') as reward,
          exists(select 1 from author_action_ledger where author_id=${p.a} and action_code='media.published' and source_type='media-item' and source_key='1' and entry_kind='outcome' and outcome<>'rejected') as success`,
      };
      await writeFile('/tmp/account-merge-semantic-query-plans.json',JSON.stringify(semanticPlans,null,2));
      const before={ledger:await client`select * from author_action_ledger where author_id=${p.a} order by id`,
        progress:await client`select * from author_progress where author_id=${p.a}`,
        trust:await client`select * from author_trust where author_id=${p.a}`};
      await client.unsafe(`create function ${schema}.reject_primary_reputation_writes() returns trigger language plpgsql as $$
        begin
          if (TG_OP<>'INSERT' and OLD.author_id=${p.a}) or (TG_OP<>'DELETE' and NEW.author_id=${p.a}) then
            raise exception 'primary reputation must remain untouched';
          end if;
          if TG_OP='DELETE' then return OLD; end if;
          return NEW;
        end $$`);
      for (const table of ['author_action_ledger','author_progress','author_trust']) await client.unsafe(`create trigger reject_primary_reputation_writes before insert or update or delete on ${table} for each row execute function ${schema}.reject_primary_reputation_writes()`);
      try {
        const preview=await service.getAccountMergePreview({...p.input,grantId:p.grantId,primaryAuthorId:p.a});
        const result=await service.confirmAccountMerge({...p.input,grantId:p.grantId,primaryAuthorId:p.a,version:preview.version});
        assert.equal(result.authorId,p.a);
        assert.deepEqual(await client`select * from author_action_ledger where author_id=${p.a} order by id`,before.ledger);
        assert.deepEqual(await client`select * from author_progress where author_id=${p.a}`,before.progress);
        assert.deepEqual(await client`select * from author_trust where author_id=${p.a}`,before.trust);
      } finally {
        for (const table of ['author_action_ledger','author_progress','author_trust']) await client.unsafe(`drop trigger reject_primary_reputation_writes on ${table}`);
      }
    });

    await t.test("large reputation ledger merges 5000 facts within PostgreSQL parameter limits", async () => {
      const p=await pair();
      await client`insert into author_action_ledger(author_id,action_code,entry_kind,source_type,source_key,idempotency_key,reward_key,xp_delta,trust_delta,occurred_at)
        select case when n<=2500 then ${p.a}::integer else ${p.b}::integer end,'media.published','reward','media-item',n::text,
          'large-ledger:'||${p.grantId}||':'||n,'large-reward:'||${p.grantId}||':'||n,1,1,now()
        from generate_series(1,5000) n`;
      const preview=await service.getAccountMergePreview({...p.input,grantId:p.grantId,primaryAuthorId:p.a});
      const primaryFacts=await client`select * from author_action_ledger where author_id=${p.a} order by id`;
      const secondaryFacts=await client`select * from author_action_ledger where author_id=${p.b} order by id`;
      await client.unsafe(`create function ${schema}.fail_second_ledger_move_batch() returns trigger language plpgsql as $$
        begin
          if OLD.author_id=${p.b} and NEW.author_id=${p.a} and OLD.source_key='3001' then
            if (select count(*) from author_action_ledger where author_id=${p.a} and source_key::integer>2500)<>500 then
              raise exception 'unexpected ledger move batch position';
            end if;
            raise exception 'injected-second-ledger-move-batch';
          end if;
          return NEW;
        end $$;
        create trigger fail_second_ledger_move_batch before update on author_action_ledger for each row execute function ${schema}.fail_second_ledger_move_batch()`);
      try {
        await assert.rejects(service.confirmAccountMerge({...p.input,grantId:p.grantId,primaryAuthorId:p.a,version:preview.version}),
          (error:unknown)=>error instanceof Error && error.cause instanceof Error && error.cause.message==='injected-second-ledger-move-batch');
        assert.deepEqual(await client`select * from author_action_ledger where author_id=${p.a} order by id`,primaryFacts);
        assert.deepEqual(await client`select * from author_action_ledger where author_id=${p.b} order by id`,secondaryFacts);
        assert.equal((await client`select * from author_progress where author_id in (${p.a},${p.b})`).length,0);
        assert.equal((await client`select merged_into_author_id from authors where id=${p.b}`)[0].merged_into_author_id,null);
        assert.equal((await client`select consumed_at from account_merge_grants where id=${p.grantId}`)[0].consumed_at,null);
        assert.equal((await client`select * from account_merge_archive where merge_id=${p.grantId}`).length,0);
      } finally { await client.unsafe('drop trigger fail_second_ledger_move_batch on author_action_ledger'); }
      let result: {authorId:number;token:string};
      try {
        result=await service.confirmAccountMerge({...p.input,grantId:p.grantId,primaryAuthorId:p.a,version:preview.version});
      } catch (error: unknown) {
        const chain: {name:string;code?:string}[]=[];
        let current:unknown=error;
        while (current instanceof Error && chain.length<8) {
          chain.push({name:current.name,code:(current as Error & {code?:string}).code});
          current=current.cause;
        }
        // A parameter-limit failure must leave the entire merge uncommitted.
        const counts=await client`select author_id,count(*)::int as facts from author_action_ledger where author_id in (${p.a},${p.b}) group by author_id order by author_id`;
        assert.deepEqual(counts.map(row=>row.facts),[2500,2500]);
        assert.equal((await client`select merged_into_author_id from authors where id=${p.b}`)[0].merged_into_author_id,null);
        assert.equal((await client`select consumed_at from account_merge_grants where id=${p.grantId}`)[0].consumed_at,null);
        assert.equal((await client`select * from account_merge_archive where merge_id=${p.grantId}`).length,0);
        assert.equal((await client`select * from author_sessions where author_id=${p.a} and revoked_at is null`).length,1);
        assert.fail(`5000-fact merge failed with safe error chain ${JSON.stringify(chain)}; rollback verified`);
      }
      assert.equal(result.authorId,p.a);
      assert.deepEqual(await client`select * from author_action_ledger where id in (select id from author_action_ledger where author_id=${p.a} and source_key::integer<=2500) order by id`,primaryFacts);
      const moved=await client`select id,author_id,created_at,occurred_at from author_action_ledger where author_id=${p.a} and source_key::integer>2500 order by id`;
      assert.deepEqual(moved.map(row=>({...row})),secondaryFacts.map(row=>({id:row.id,author_id:p.a,created_at:row.created_at,occurred_at:row.occurred_at})));
      assert.equal((await client`select count(*)::int as facts from author_action_ledger where author_id=${p.a}`)[0].facts,5000);
      assert.equal((await client`select count(*)::int as facts from author_action_ledger where author_id=${p.b}`)[0].facts,0);
      assert.equal((await client`select xp_total from author_progress where author_id=${p.a}`)[0].xp_total,5000);
      assert.equal((await client`select trust_points from author_trust where author_id=${p.a}`)[0].trust_points,5000);
    });

    await t.test("bounded merge scale: 2000 ratings, 500 conflicts and 1500 resulting records", async () => {
      const p=await pair();
      const prefix=`scale-${randomUUID()}-`;
      await client`insert into media_items(code,title,media_type)
        select ${prefix}||n,'Scale fixture '||n,'game' from generate_series(1,1500) n`;
      await client`insert into ratings(media_item_id,author_id,score)
        select m.id,${p.a},90 from generate_series(1,1000) n
        join media_items m on m.code=${prefix}||n`;
      await client`insert into ratings(media_item_id,author_id,score)
        select m.id,${p.b},50 from generate_series(501,1500) n
        join media_items m on m.code=${prefix}||n`;
      await client.unsafe('analyze ratings; analyze contributions; analyze author_action_ledger; analyze authors');
      const plan=await client`explain (analyze,buffers,format json) select to_jsonb(t) from ratings t where author_id in (${p.a},${p.b})`;
      const previewStarted=performance.now();
      const preview=await service.getAccountMergePreview({...p.input,grantId:p.grantId,primaryAuthorId:p.a});
      const previewMs=performance.now()-previewStarted;
      assert.equal(preview.counts.find(count=>count.label==='Оценки')?.conflicts,500);
      const confirmStarted=performance.now();
      const result=await service.confirmAccountMerge({...p.input,grantId:p.grantId,primaryAuthorId:p.a,version:preview.version});
      const confirmMs=performance.now()-confirmStarted;
      const [counts]=await client`select count(*)::int as retained from ratings where author_id=${p.a}`;
      assert.equal(result.authorId,p.a);
      assert.equal(counts.retained,1500);
      assert.equal((await client`select count(*)::int as conflicts from account_merge_archive where merge_id=${p.grantId} and table_name='ratings'`)[0].conflicts,500);
      await writeFile('/tmp/account-merge-scale.json',JSON.stringify({counts:{initialPerAccount:1000,overlap:500,resulting:counts.retained},previewMs,confirmMs,plan},null,2));
      t.diagnostic(`bounded scale preview=${previewMs.toFixed(1)}ms confirm=${confirmMs.toFixed(1)}ms`);
    });
    await t.test("legacy primary successful facts survive merge, delayed events and real historical initialization", async () => {
      const p=await pair();
      const [media]=await client`insert into media_items(code,title,media_type,created_by_author_id,publication_status) values (${randomUUID()},'Legacy successful fact','game',${p.a},'published') returning id`;
      const sourceKey=String(media.id);
      await client`insert into author_action_ledger(author_id,action_code,entry_kind,source_type,source_key,idempotency_key,reward_key,xp_delta,trust_delta,outcome,occurred_at,created_at)
        values (${p.a},'media.published','reward','media-item',${sourceKey},${`legacy:reward:${p.a}:${sourceKey}`},${`legacy-reward:${p.a}:${sourceKey}`},20,3,null,'2020-01-01','2020-01-02'),
        (${p.a},'media.published','outcome','media-item',${sourceKey},${`historical:outcome:approved:media.published:${p.a}:media-item:${sourceKey}`},null,0,0,'approved','2020-01-01','2020-01-02')`;
      await client`insert into author_progress(author_id,xp_total) values (${p.a},20)`;
      await client`insert into author_trust(author_id,trust_points,successful_outcomes) values (${p.a},3,1)`;
      await client`update xp_action_rules set xp=20 where action_code='media.published'`;
      await client`update trust_action_rules set trust_points=3,counts_toward_trust=true where action_code='media.published'`;
      await client`update level_settings set status='enabled' where id=1`;
      const before={ledger:await client`select * from author_action_ledger where author_id=${p.a} order by id`,
        progress:await client`select * from author_progress where author_id=${p.a}`,
        trust:await client`select * from author_trust where author_id=${p.a}`};
      const preview=await service.getAccountMergePreview({...p.input,grantId:p.grantId,primaryAuthorId:p.a});
      await service.confirmAccountMerge({...p.input,grantId:p.grantId,primaryAuthorId:p.a,version:preview.version});
      const {db}=await import('../src/db');
      const {applyReputationEvent}=await import('../src/lib/reputation/service');
      for (const type of ['media.approved','media.published'] as const) {
        const eventId=randomUUID();
        const payload={authorId:p.a,mediaItemId:media.id};
        await client`insert into domain_events(id,type,actor_author_id,aggregate_type,aggregate_id,payload) values (${eventId},${type},${p.a},'media-item',${sourceKey},${client.json(payload)})`;
        await db.transaction(tx=>applyReputationEvent(tx,{id:eventId,type,schemaVersion:1,occurredAt:new Date(),actorAuthorId:p.a,aggregateType:'media-item',aggregateId:sourceKey,payload}));
      }
      assert.deepEqual(await client`select * from author_action_ledger where author_id=${p.a} order by id`,before.ledger);
      assert.deepEqual(await client`select * from author_progress where author_id=${p.a}`,before.progress);
      assert.deepEqual(await client`select * from author_trust where author_id=${p.a}`,before.trust);
      const lockToken=randomUUID();
      const [run]=await client`insert into job_runs(type,payload,source,status,created_by_admin_id,scheduled_for,available_at,max_attempts,timeout_seconds,retry_base_seconds,retry_max_seconds,lock_token,lock_expires_at)
        values ('reputation.initialize',${client.json({initializationRequested:true})},'manual','running',${admin.id},now(),now(),1,60,1,1,${lockToken},now()+interval '1 minute') returning id`;
      await client`update level_settings set status='initializing' where id=1`;
      const {initializeReputation}=await import('../src/lib/reputation/initialize');
      await initializeReputation({runId:run.id,lockToken});
      assert.deepEqual(await client`select * from author_action_ledger where author_id=${p.a} order by id`,before.ledger);
      assert.equal((await client`select xp_total from author_progress where author_id=${p.a}`)[0].xp_total,20);
      const [trust]=await client`select trust_points,successful_outcomes,rejected_outcomes from author_trust where author_id=${p.a}`;
      assert.deepEqual({...trust},{trust_points:3,successful_outcomes:1,rejected_outcomes:0});
    });
  } finally {
    await close?.();
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    await client.unsafe(`drop schema if exists ${schema} cascade`);
    await client.end({ timeout: 2 });
  }
});
