import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
const tgApi = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const STALE_GRACE_MS = 5 * 60 * 1000;

function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c] as string));
}

function formatAlert(m: any) {
  const minutesLeft = Math.max(0, Math.round((Number(m.start_at) - Date.now()) / 60000));
  const league = m.campionato ? ` (${esc(m.campionato)})` : '';
  const tipo = m.tipo_giocata ? esc(m.tipo_giocata) : '—';
  return `⏰ <b>Tra ${minutesLeft} min</b>${league}\n${esc(m.casa)} - ${esc(m.trasferta)}\n👉 ${tipo}`;
}

async function sendMessage(chatId: string, text: string) {
  const r = await fetch(`${tgApi}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (CRON_SECRET) {
    const got = req.headers.get('x-cron-secret') || '';
    if (got !== CRON_SECRET) return new Response('unauthorized', { status: 401 });
  }

  const now = Date.now();
  const horizon = now + 120 * 60 * 1000;
  const { data: pending, error } = await supabase
    .from('matches')
    .select('*')
    .eq('notified', false)
    .eq('bot_enabled', true)
    .lte('start_at', horizon)
    .order('start_at', { ascending: true });
  if (error) throw error;

  const { data: subs, error: subsErr } = await supabase.from('subscribers').select('chat_id');
  if (subsErr) throw subsErr;

  let sentMatches = 0;
  for (const m of pending || []) {
    const startAt = Number(m.start_at);
    const dueAt = startAt - Number(m.notify_minutes || 10) * 60000;
    if (now < dueAt) continue;

    if (startAt - now < -STALE_GRACE_MS) {
      await supabase.from('matches').update({ notified: true }).eq('id', m.id).eq('notified', false);
      continue;
    }

    const { data: claimed, error: claimErr } = await supabase.rpc('claim_match_notification', { p_id: m.id });
    if (claimErr) {
      console.error('claim failed', m.id, claimErr.message);
      continue;
    }
    if (!claimed || claimed.length === 0) continue;

    const text = formatAlert(claimed[0]);
    let okCount = 0;
    for (const s of subs || []) {
      try { if (await sendMessage(String(s.chat_id), text)) okCount++; }
      catch (e) { console.error('Telegram send error', s.chat_id, e); }
    }

    // If absolutely nobody could be reached, release the claim so the next cron can retry.
    if ((subs || []).length > 0 && okCount === 0) {
      await supabase.from('matches').update({ notified: false }).eq('id', m.id);
      continue;
    }
    sentMatches++;
  }

  return Response.json({ ok: true, checked: pending?.length || 0, sentMatches });
});
