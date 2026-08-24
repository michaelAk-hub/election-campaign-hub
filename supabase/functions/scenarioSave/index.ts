// scenarioSave — validate + upsert a prediction scenario (max 4).
import { getServiceClient } from "../_shared/client.ts";
import { preflight, json } from "../_shared/http.ts";
import { strictAuth } from "../_shared/appSession.ts";

const ALLOWED_FIELDS = ["academic_level", "admission_year"];
const ALLOWED_OPERATORS = ["=", "IN"];

function validateScenarioPayload(scenario: any): string[] {
  const errors: string[] = [];
  if (!scenario || typeof scenario !== "object") return ["Το σενάριο δεν είναι έγκυρο αντικείμενο"];
  if (!scenario.name || typeof scenario.name !== "string" || !scenario.name.trim()) errors.push("Το όνομα σεναρίου είναι υποχρεωτικό");

  const seats = Number(scenario.total_seats);
  if (!isFinite(seats) || seats <= 0) errors.push("Ο αριθμός εδρών πρέπει να είναι θετικός αριθμός");
  const order = Number(scenario.display_order);
  if (!isFinite(order) || order <= 0) errors.push("Η σειρά εμφάνισης πρέπει να είναι θετικός αριθμός");

  const cfg = scenario.config_json;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) { errors.push("Το config_json πρέπει να είναι αντικείμενο"); return errors; }
  if (!Array.isArray(cfg.parties) || cfg.parties.length === 0) { errors.push("Απαιτείται τουλάχιστον μία παράταξη"); return errors; }

  const partyNames: string[] = [];
  const globalSymbols = new Map<string, string>();
  for (let pi = 0; pi < cfg.parties.length; pi++) {
    const party = cfg.parties[pi];
    const pLabel = `Παράταξη #${pi + 1}`;
    const partyName = (party.name || "").trim();
    if (!partyName) errors.push(`${pLabel}: λείπει το όνομα`);
    else {
      const nameLower = partyName.toLowerCase();
      if (partyNames.includes(nameLower)) errors.push(`Διπλό όνομα παράταξης: "${partyName}"`);
      else partyNames.push(nameLower);
    }
    if (!Array.isArray(party.symbols) || party.symbols.length === 0) {
      errors.push(`${pLabel} "${partyName}": απαιτείται τουλάχιστον ένα σύμβολο`);
    } else {
      const partySymbols = new Set<string>();
      for (let si = 0; si < party.symbols.length; si++) {
        const sm = party.symbols[si];
        const sym = (sm.symbol || "").trim();
        if (!sym) { errors.push(`${pLabel} "${partyName}": κενό σύμβολο στη θέση ${si + 1}`); continue; }
        if (partySymbols.has(sym)) errors.push(`${pLabel} "${partyName}": διπλό σύμβολο "${sym}"`);
        else partySymbols.add(sym);
        if (!globalSymbols.has(sym)) globalSymbols.set(sym, partyName);
        const mult = Number(sm.multiplier);
        if (!isFinite(mult) || mult <= 0) errors.push(`${pLabel} "${partyName}", σύμβολο "${sym}": ο πολλαπλασιαστής πρέπει να είναι > 0`);
      }
    }
  }

  if (cfg.year_groups !== undefined && cfg.year_groups !== null) {
    if (!Array.isArray(cfg.year_groups)) errors.push("Το year_groups πρέπει να είναι πίνακας");
    else {
      for (let gi = 0; gi < cfg.year_groups.length; gi++) {
        const group = cfg.year_groups[gi];
        const gLabel = `Ομάδα #${gi + 1}`;
        const gName = (group.name || "").trim();
        if (!gName) errors.push(`${gLabel}: λείπει το όνομα`);
        if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
          errors.push(`${gLabel} "${gName}": απαιτείται τουλάχιστον μία συνθήκη`);
        } else {
          for (let ci = 0; ci < group.conditions.length; ci++) {
            const cond = group.conditions[ci];
            const cLabel = `${gLabel} "${gName}", συνθήκη #${ci + 1}`;
            if (!ALLOWED_FIELDS.includes(cond.field)) errors.push(`${cLabel}: μη επιτρεπτό πεδίο "${cond.field}". Επιτρεπτά: ${ALLOWED_FIELDS.join(", ")}`);
            if (!ALLOWED_OPERATORS.includes(cond.operator)) errors.push(`${cLabel}: μη επιτρεπτός τελεστής "${cond.operator}". Επιτρεπτοί: ${ALLOWED_OPERATORS.join(", ")}`);
            if (cond.operator === "=" && (!cond.value || !(cond.value + "").trim())) errors.push(`${cLabel}: ο τελεστής "=" απαιτεί μη κενή τιμή`);
            if (cond.operator === "IN" && (!Array.isArray(cond.values) || cond.values.length === 0)) errors.push(`${cLabel}: ο τελεστής "IN" απαιτεί τουλάχιστον μία τιμή`);
          }
        }
      }
    }
  }
  return errors;
}

function normalizeScenario(scenario: any) {
  const cfg = scenario.config_json || {};
  return {
    name: scenario.name.trim(),
    total_seats: Number(scenario.total_seats),
    display_order: Number(scenario.display_order) || 1,
    is_active: true,
    config_json: {
      parties: (cfg.parties || []).map((p: any) => ({
        name: p.name.trim(),
        color: p.color || "#6b7280",
        symbols: (p.symbols || []).map((s: any) => ({ symbol: s.symbol.trim(), multiplier: Number(s.multiplier) })),
      })),
      year_groups: (cfg.year_groups || []).map((g: any) => ({
        name: g.name.trim(),
        conditions: (g.conditions || []).map((c: any) => ({
          field: c.field, operator: c.operator,
          ...(c.operator === "=" ? { value: (c.value + "").trim() } : {}),
          ...(c.operator === "IN" ? { values: (c.values || []) } : {}),
        })),
      })),
    },
  };
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const supabase = getServiceClient();
    const body = await req.json().catch(() => ({}));
    const { scenario_id, scenario } = body;

    const auth = await strictAuth(supabase, body.session_token);
    if (auth.error) return json({ error: auth.error, ...(auth.force_logout ? { force_logout: true } : {}) }, auth.status);

    const validationErrors = validateScenarioPayload(scenario);
    if (validationErrors.length > 0) {
      return json({ error: "VALIDATION_ERROR", message: "Υπάρχουν σφάλματα επικύρωσης", errors: validationErrors }, 400);
    }

    const normalized = normalizeScenario(scenario);

    if (!scenario_id) {
      const { data: existing } = await supabase.from("PredictionScenario").select("id").order("display_order", { ascending: true }).limit(4);
      if ((existing || []).length >= 4) return json({ error: "MAX_LIMIT", message: "Υπάρχουν ήδη 4 σενάρια. Διαγράψτε ένα πρώτα." }, 400);
      normalized.display_order = normalized.display_order || ((existing?.length ?? 0) + 1);
      const { data: created } = await supabase.from("PredictionScenario").insert(normalized).select().single();
      return json({ scenario: created });
    } else {
      const { data: updated } = await supabase.from("PredictionScenario").update({
        name: normalized.name, total_seats: normalized.total_seats,
        display_order: normalized.display_order, config_json: normalized.config_json,
      }).eq("id", scenario_id).select().single();
      return json({ scenario: updated });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
