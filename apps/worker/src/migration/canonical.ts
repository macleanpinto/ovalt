import type { CanonicalTag, GtmExportPayload } from "./types.js";

function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function extractParams(tag: Record<string, unknown>): { map: Record<string, string>; keys: string[] } {
  const map: Record<string, string> = {};
  const params = tag.parameter;
  if (!Array.isArray(params)) return { map, keys: [] };
  const keys: string[] = [];
  for (const p of params) {
    if (!p || typeof p !== "object") continue;
    const pr = p as Record<string, unknown>;
    const key = asStr(pr.key);
    if (!key) continue;
    keys.push(key);
    const type = asStr(pr.type);
    let val = "";
    if (type === "list") {
      const list = pr.list;
      if (Array.isArray(list)) {
        val = list
          .map((item) => {
            if (!item || typeof item !== "object") return "";
            const row = item as Record<string, unknown>;
            const parts = [row.key, row.value].map(asStr).filter(Boolean);
            return parts.join("=");
          })
          .filter(Boolean)
          .join(";");
      }
    } else {
      val = asStr(pr.value);
    }
    map[key] = val;
  }
  return { map, keys };
}

export function buildTriggerNameLookup(entities: GtmExportPayload["entities"]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of entities?.triggers ?? []) {
    const tr = t as Record<string, unknown>;
    const id = asStr(tr.triggerId);
    const name = asStr(tr.name);
    if (id) m.set(id, name || id);
  }
  return m;
}

export function extractCanonicalTags(payload: GtmExportPayload): CanonicalTag[] {
  const tags = payload.entities?.tags ?? [];
  const out: CanonicalTag[] = [];
  for (const raw of tags) {
    const tag = raw as Record<string, unknown>;
    const tagId = asStr(tag.tagId);
    const name = asStr(tag.name);
    const type = asStr(tag.type);
    const ft = tag.firingTriggerId;
    const firingTriggerIds = Array.isArray(ft) ? ft.map(asStr) : ft ? [asStr(ft)] : [];
    const { map, keys } = extractParams(tag);
    out.push({
      tagId: tagId || `unknown-${out.length}`,
      name: name || "(unnamed tag)",
      type: type || "unknown",
      firingTriggerIds,
      parameters: map,
      rawParameterKeys: keys
    });
  }
  return out;
}

export function triggerSummary(
  tag: CanonicalTag,
  triggerLookup: Map<string, string>
): string {
  if (tag.firingTriggerIds.length === 0) return "No trigger";
  const names = tag.firingTriggerIds.map((id) => triggerLookup.get(id) ?? id);
  return names.join(", ");
}
