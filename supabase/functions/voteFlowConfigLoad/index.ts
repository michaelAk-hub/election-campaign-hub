// voteFlowConfigLoad — load the vote-flow mapping config for the active dataset.
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

    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ config: null, dataset_id: null, message: "No active dataset" });

    const { data: configs } = await supabase.from("PredictionVoteFlowConfig").select("*").eq("dataset_id", datasetId);
    const config = configs?.[0] || null;
    if (!config) return json({ config: null, dataset_id: datasetId });

    const rawMapping = config.mapping_json?.data || [];
    return json({
      config: {
        id: config.id,
        dataset_id: config.dataset_id,
        is_enabled: config.is_enabled || false,
        bucket_minutes: config.bucket_minutes || 5,
        mapping: normalizeMappingSymbols(rawMapping),
        updated_by_name: config.updated_by_name || null,
        updated_at: config.updated_at || null,
      },
      dataset_id: datasetId,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
