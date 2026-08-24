// voteFlowConfigSave — upsert the vote-flow mapping config for the active dataset.
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getActiveDatasetId, normalizeSymbol } from "../_shared/prediction.ts";

function normalizeMappingSymbols(mapping: any): any {
  if (!Array.isArray(mapping)) return mapping;
  return mapping.map((entry: any) => ({
    ...entry,
    symbols: Array.isArray(entry.symbols) ? entry.symbols.map(normalizeSymbol) : [],
  }));
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const { is_enabled, mapping, bucket_minutes } = body;
    if (is_enabled && (!Array.isArray(mapping) || mapping.length === 0)) {
      return json({ error: "mapping must be a non-empty array when is_enabled=true" }, 400);
    }

    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ error: "No active dataset found" }, 400);

    const user = auth.user;
    const updatedByName = [user.name, user.surname].filter(Boolean).join(" ").trim() || user.email || "";
    const now = new Date().toISOString();

    const payload = {
      dataset_id: datasetId,
      is_enabled: !!is_enabled,
      bucket_minutes: Number(bucket_minutes) || 5,
      mapping_json: { data: normalizeMappingSymbols(mapping || []) },
      updated_by_user_id: user.id,
      updated_by_name: updatedByName,
      updated_at: now,
    };

    const { data: existing } = await supabase.from("PredictionVoteFlowConfig").select("id").eq("dataset_id", datasetId);
    let saved: any;
    if (existing?.length) {
      const r = await supabase.from("PredictionVoteFlowConfig").update(payload).eq("id", existing[0].id).select().single();
      saved = r.data;
    } else {
      const r = await supabase.from("PredictionVoteFlowConfig").insert(payload).select().single();
      saved = r.data;
    }

    return json({
      config: {
        id: saved.id,
        dataset_id: saved.dataset_id,
        is_enabled: saved.is_enabled,
        bucket_minutes: saved.bucket_minutes,
        mapping: saved.mapping_json?.data || [],
        updated_by_name: saved.updated_by_name,
        updated_at: saved.updated_at,
      },
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
