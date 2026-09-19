import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
const tgApi = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function sendMessage(chatId: string | number, text: string) {
  const r = await fetch(`${tgApi}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });
  if (!r.ok) console.error('Telegram sendMessage failed:', await r.text());
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  if (TELEGRAM_WEBHOOK_SECRET) {
    const got = req.headers.get('x-telegram-bot-api-secret-token') || '';
    if (got !== TELEGRAM_WEBHOOK_SECRET) return new Response('unauthorized', { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.text || !msg?.chat?.id) return Response.json({ ok: true });

  const chatId = String(msg.chat.id);
  const username = msg.from?.username || msg.from?.first_name || '';
  const text = String(msg.text).trim();

  if (text === '/start') {
    const { error } = await supabase.from('subscribers').upsert({
      chat_id: chatId,
      username,
      created_at: Date.now()
    }, { onConflict: 'chat_id' });
    if (error) throw error;
    await sendMessage(chatId,
      "Ciao! Da ora ricevi qui gli avvisi delle partite caricate, qualche minuto prima dell'inizio.\n\nScrivi /stop per non ricevere più avvisi."
    );
  } else if (text === '/stop') {
    const { error } = await supabase.from('subscribers').delete().eq('chat_id', chatId);
    if (error) throw error;
    await sendMessage(chatId, 'Avvisi disattivati. Scrivi /start per riattivarli quando vuoi.');
  }

  return Response.json({ ok: true });
});
