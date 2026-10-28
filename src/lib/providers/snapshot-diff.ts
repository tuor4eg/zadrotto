export type SnapshotDifference = {
  path: string;
  kind: "added" | "removed" | "changed";
  current?: unknown;
  proposed?: unknown;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Match provider identities before comparing fields so an inserted person does not shift every row. */
function arrayIdentity(left: unknown[], right: unknown[]) {
  const rows = [...left, ...right];
  if (!rows.length || !rows.every(record)) return null;
  for (const field of ["externalId", "externalCreatorId", "creatorId", "id", "name"]) {
    if (!rows.every(row => typeof row[field] === "string" || typeof row[field] === "number")) continue;
    const key = (row: unknown) => {
      const item = row as Record<string, unknown>;
      return JSON.stringify([item[field], item.roleCode ?? item.role ?? null]);
    };
    if ([left, right].every(items => new Set(items.map(key)).size === items.length)) return key;
  }
  return null;
}

/** A display-only value comparison. It does not decide whether provider data may be applied. */
export function getSnapshotDifferences(current: unknown, proposed: unknown): SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];
  function walk(left: unknown, right: unknown, path: string, hasLeft = true, hasRight = true) {
    if (!hasLeft || !hasRight) {
      differences.push({path,kind:hasLeft ? "removed" : "added",...(hasLeft ? {current:left} : {proposed:right})});
      return;
    }
    if (Object.is(left,right)) return;
    if (record(left) && record(right)) {
      for (const key of new Set([...Object.keys(left),...Object.keys(right)])) {
        walk(left[key],right[key],path ? `${path}.${key}` : key,Object.hasOwn(left,key),Object.hasOwn(right,key));
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const identity = arrayIdentity(left,right);
      if (identity) {
        const remaining = new Map(right.map((item,index) => [identity(item),{item,index}]));
        left.forEach((item,index) => {
          const key = identity(item);
          const match = remaining.get(key);
          walk(item,match?.item,`${path}[${index}]`,true,Boolean(match));
          remaining.delete(key);
        });
        for (const {item,index} of remaining.values()) walk(undefined,item,`${path}[${index}]`,false,true);
      } else if ([...left,...right].every(value => value === null || typeof value !== "object")) {
        const remaining = right.map((item,index) => ({item,index}));
        left.forEach((item,index) => {
          const match = remaining.findIndex(value => Object.is(value.item,item));
          if (match >= 0) remaining.splice(match,1);
          else walk(item,undefined,`${path}[${index}]`,true,false);
        });
        for (const {item,index} of remaining) walk(undefined,item,`${path}[${index}]`,false,true);
      } else {
        for (let index=0;index<Math.max(left.length,right.length);index++) {
          walk(left[index],right[index],`${path}[${index}]`,index<left.length,index<right.length);
        }
      }
      return;
    }
    differences.push({path:path || "Значение",kind:"changed",current:left,proposed:right});
  }
  walk(current,proposed,"");
  return differences;
}
