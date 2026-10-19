import assert from "node:assert/strict";
import {test} from "node:test";
import {and,eq,sql} from "drizzle-orm";

const testUrl=process.env.CREATOR_ROLE_PERF_DATABASE_URL;
test("creator role membership uses bounded indexed sets at 100k records",{skip:!testUrl},async(t)=>{
  const schema=`creator_role_perf_${Date.now()}`;
  const url=new URL(testUrl!);url.searchParams.set("options",`-c search_path=${schema}`);
  process.env.DATABASE_URL=url.toString();process.env.DATABASE_MAX_CONNECTIONS="2";
  const {db,getDbClient}=await import("../src/db");
  const {mediaItems}=await import("../src/db/schema");
  const {creatorCondition}=await import("../src/db/queries/creators");
  const client=getDbClient();
  try {
    await client.unsafe(`create schema ${schema};
      create table media_items(id int primary key,publication_status text,media_type text,release_year int);
      create table creator_roles(id int primary key,code text unique);
      insert into creator_roles values(1,'writer'),(2,'developer'),(3,'publisher');
      create table entry_creators(entry_id int,creator_id int,role_id int,primary key(entry_id,creator_id,role_id));
      create index entry_creators_creator_role_idx on entry_creators(creator_id,role_id,entry_id);
      create table entry_creator_pseudonyms(entry_id int primary key,creator_id int,role_id int);
      create index entry_creator_pseudonyms_creator_idx on entry_creator_pseudonyms(creator_id);
      create table creator_relations(source_creator_id int,target_creator_id int,relation_type text,primary key(source_creator_id,target_creator_id,relation_type));
      create index creator_relations_target_idx on creator_relations(target_creator_id);
      insert into media_items select g,case when g%10=0 then 'draft' else 'published' end,'game',1980+g%45 from generate_series(1,100000)g;
      insert into entry_creators select (g-1)%100000+1,((g-1)/100000)*1000+((g-1)%100000)%1000+1,
        case when g>400000 then 1 else 2+(g/1000)%2 end from generate_series(1,500000)g;
      insert into entry_creators select g,42,2 from generate_series(1,100000)g where g%3=0 on conflict do nothing;
      insert into entry_creators select g,42,3 from generate_series(1,100000)g where g%7=0 on conflict do nothing;
      insert into entry_creator_pseudonyms select g,6001,1 from generate_series(1,100000)g where g%17=0;
      insert into creator_relations values(6001,4001,'pseudonym_of'),(6001,4002,'pseudonym_of');
      insert into entry_creators select g,6001,1 from generate_series(1,100000)g where g%13=0 on conflict do nothing;
      analyze media_items;analyze entry_creators;analyze creator_roles;analyze entry_creator_pseudonyms;analyze creator_relations;`);
    for(const [label,id,role] of [
      ["popular-developer",42,"developer"],["popular-publisher",42,"publisher"],
      ["rare-developer",1042,"developer"],["absent",999999,"developer"],
      ["all-roles",42,undefined],["writer-pseudonyms",4001,"writer"],
    ] as const) {
      const where=and(eq(mediaItems.publicationStatus,"published"),creatorCondition(id,undefined,role));
      const shapes={
        count:db.select({count:sql`count(*)`}).from(mediaItems).where(where),
        list:db.select({id:mediaItems.id}).from(mediaItems).where(where).orderBy(mediaItems.id).limit(24),
        types:db.select({type:mediaItems.mediaType,count:sql`count(*)`}).from(mediaItems).where(where).groupBy(mediaItems.mediaType),
        years:db.select({min:sql`min(${mediaItems.releaseYear})`}).from(mediaItems).where(where),
      };
      for(const [shape,query] of Object.entries(shapes)) {
        const compiled=query.toSQL();
        const [row]=await client.unsafe("explain(analyze,buffers,format json) "+compiled.sql,compiled.params);
        const plan=row["QUERY PLAN"][0];
        const nodes:Array<{type:string;index?:string;loops:number;rows:number}>=[];
        const walk=(node:Record<string,unknown>)=>{
          nodes.push({type:String(node["Node Type"]),index:node["Index Name"] as string|undefined,loops:Number(node["Actual Loops"]),rows:Number(node["Actual Rows"])});
          for(const child of (node.Plans??[]) as Record<string,unknown>[])walk(child);
        };
        walk(plan.Plan);
        assert.ok(nodes.some(node=>node.index==="entry_creators_creator_role_idx"));
        assert.ok(!nodes.some(node=>node.type==="Seq Scan"&&node.loops>1&&node.rows>1000),"no repeated full scans per media record");
        t.diagnostic(JSON.stringify({label,shape,ms:plan["Execution Time"],jit:plan.JIT?.Timing?.Total,nodes}));
      }
    }
  }finally{await client.unsafe(`drop schema if exists ${schema} cascade`);await client.end();}
});
