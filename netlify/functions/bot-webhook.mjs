import crypto from 'node:crypto';

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 200, body: 'MAKTAB MASLAHATCHISI bot webhook' };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const appUrl = process.env.MINI_APP_URL;
  if (!token || !secret || !appUrl) return { statusCode: 500, body: 'Webhook is not configured' };

  // Faqat Telegram yuborgan so'rovlar qabul qilinadi (setWebhook secret_token).
  const got = event.headers['x-telegram-bot-api-secret-token'];
  if (!safeEqual(got, secret)) return { statusCode: 401, body: 'unauthorized' };

  try {
    const update = JSON.parse(event.body || '{}');
    const msg = update.message;
    if (msg?.chat?.type === 'private' && msg.text?.startsWith('/start')) {
      const name = msg.from?.first_name || 'nomzod';
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: msg.chat.id,
          text: `Assalomu alaykum, ${name}! MAKTAB MASLAHATCHISI platformasiga xush kelibsiz. Test ishlash va natijalarni ko‘rish uchun mini-ilovani oching.`,
          reply_markup: { inline_keyboard: [[{ text: 'Mini ilovani ochish', web_app: { url: appUrl } }]] }
        })
      });
      if (!res.ok) console.error('sendMessage failed', res.status, await res.text());
    }
  } catch (e) {
    console.error('webhook error', e);
  }
  return { statusCode: 200, body: 'ok' };
}
