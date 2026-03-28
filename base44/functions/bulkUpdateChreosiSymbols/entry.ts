import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getStatusCode(err) {
  return (
    err?.status ??
    err?.response?.status ??
    err?.cause?.status ??
    err?.cause?.response?.status ??
    null
  );
}

function asMessage(err) {
  return (
    err?.message ??
    err?.cause?.message ??
    (typeof err === 'string' ? err : JSON.stringify(err))
  );
}

async function retryOn429(fn, baseDelayMs, maxRetries = 6) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = getStatusCode(err);
      if (status !== 429 || attempt >= maxRetries) throw err;
      const jitter = Math.floor(Math.random() * 120);
      const backoff = Math.min(5000, baseDelayMs * Math.pow(2, attempt) + jitter);
      await sleep(backoff);
      attempt++;
    }
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const accountIds = body.accountIds ?? body.ids ?? [];
    const symbolsToAssign = body.symbolsToAssign ?? body.symbols ?? [];
    const start = Number.isFinite(body.start) ? body.start : 0;
    const max = Number.isFinite(body.max) ? body.max : 80;
    const delayMs = Number.isFinite(body.delayMs) ? body.delayMs : 350;

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return Response.json({ ok: false, error: 'accountIds is required' }, { status: 400 });
    }
    if (!Array.isArray(symbolsToAssign)) {
      return Response.json({ ok: false, error: 'symbolsToAssign must be an array' }, { status: 400 });
    }

    const endExclusive = Math.min(accountIds.length, start + max);
    let updated = 0;
    const failed = [];

    for (let i = start; i < endExclusive; i++) {
      const id = accountIds[i];
      try {
        await retryOn429(
          () => base44.asServiceRole.entities.ChreosiAccount.update(id, {
            allowed_prediction_symbols: symbolsToAssign,
          }),
          delayMs,
          6,
        );
        updated++;
      } catch (err) {
        failed.push({ id, error: asMessage(err), status: getStatusCode(err) ?? undefined });
      }
      await sleep(delayMs);
    }

    const nextStart = endExclusive;
    const done = nextStart >= accountIds.length;

    return Response.json({
      ok: true,
      total: accountIds.length,
      start,
      processed: endExclusive - start,
      nextStart,
      done,
      updated,
      failed,
      delayMsUsed: delayMs,
    });
  } catch (error) {
    return Response.json({ ok: false, error: asMessage(error) }, { status: 500 });
  }
});