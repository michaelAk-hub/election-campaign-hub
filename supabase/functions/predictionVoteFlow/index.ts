// predictionVoteFlow — cumulative votes over time, bucketed, per parataxi (live).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";
import { getActiveDatasetId, getActivePersons, normalizeSymbol } from "../_shared/prediction.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { bucket_minutes = 5, mapping, year, symbol, department } = body;

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    if (!Array.isArray(mapping) || mapping.length === 0) return json({ error: "Mapping is required" }, 400);
    if (bucket_minutes < 1 || bucket_minutes > 60) return json({ error: "bucket_minutes must be between 1 and 60" }, 400);

    const datasetId = await getActiveDatasetId(supabase);
    if (!datasetId) return json({ bucket_minutes, labels: [], series: [], meta: {} });

    const persons = await getActivePersons(supabase, datasetId);
    let filtered = persons.filter((p) => p.voted === true && p.voted_at);

    if (year) {
      const years = String(year).split(",").map((y: string) => y.trim());
      filtered = filtered.filter((p) => years.includes(String(p.admission_year || "")));
    }
    if (symbol) {
      const symbols = String(symbol).split(",").map((s: string) => s.trim());
      filtered = filtered.filter((p) => symbols.includes(normalizeSymbol(p.prediction_symbol)));
    }
    if (department) {
      const departments = String(department).split(",").map((d: string) => d.trim());
      filtered = filtered.filter((p) => departments.includes(p.department || ""));
    }

    if (filtered.length === 0) return json({ bucket_minutes, labels: [], series: [], meta: { dataset_id: datasetId } });

    const voteTimes = filtered.map((p) => new Date(p.voted_at).getTime());
    const minTime = Math.min(...voteTimes);
    const maxTime = Math.max(...voteTimes);
    const bucketSizeMs = bucket_minutes * 60 * 1000;
    const startBucket = Math.floor(minTime / bucketSizeMs) * bucketSizeMs;
    const endBucket = Math.ceil(maxTime / bucketSizeMs) * bucketSizeMs;

    const buckets: number[] = [];
    for (let t = startBucket; t <= endBucket; t += bucketSizeMs) buckets.push(t);

    const bucketCounts = new Map<number, Map<string, number>>();
    for (const person of filtered) {
      const bucket = Math.floor(new Date(person.voted_at).getTime() / bucketSizeMs) * bucketSizeMs;
      const sym = normalizeSymbol(person.prediction_symbol);
      if (!bucketCounts.has(bucket)) bucketCounts.set(bucket, new Map());
      const symbolMap = bucketCounts.get(bucket)!;
      symbolMap.set(sym, (symbolMap.get(sym) || 0) + 1);
    }

    const series = mapping.map(({ parataxi, symbols }: any) => {
      let cumulative = 0;
      const points = buckets.map((bucket) => {
        let count = 0;
        const symbolMap = bucketCounts.get(bucket);
        if (symbolMap) for (const sym of symbols) count += symbolMap.get(sym) || 0;
        cumulative += count;
        return cumulative;
      });
      return { parataxi, points };
    });

    const labels = buckets.map((t) => new Date(t).toISOString());
    return json({ bucket_minutes, labels, series, meta: { dataset_id: datasetId } });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
