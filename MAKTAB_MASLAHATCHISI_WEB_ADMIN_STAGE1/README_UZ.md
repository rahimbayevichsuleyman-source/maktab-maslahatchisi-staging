# MAKTAB MASLAHATCHISI — web admin + Telegram Mini App (v2.1)

Netlify + Supabase asosidagi Telegram Mini App va alohida web administrator paneli. Telegram `initData` serverda HMAC orqali tekshiriladi; `service_role` kaliti faqat Netlify Functions muhitida saqlanadi.

## Loyiha tuzilmasi

```
public/            index.html, app.js, admin/      (Mini App va web admin frontend)
netlify/functions/ api.mjs, bot-webhook.mjs        (backend)
netlify/lib/       logic.mjs                       (baholash, savol quruvchi — testlangan)
supabase/          schema.sql                      (migratsiya)
tests/             logic.test.mjs                  (npm test)
```

## v1.1 da tuzatilgan asosiy xatolar

- **Rasmiy imtihon ballari**: avval ball savolning bazadagi qiymatidan (1) hisoblanardi, endi 3.1 / 2.1 ballar urinishda saqlanadi — maksimum aniq 78.
- **Y2/Y3/Y4 baholash**: javoblar satr/son farqi sababli doim noto‘g‘ri chiqardi; endi serverda normallashtiriladi.
- **Y3/Y4 interfeysi**: nomzod JSON yozishi kerak edi; endi tanlash ro‘yxatlari va ▲▼ tartiblash. Admin esa oddiy matn kiritadi, javob kaliti avtomatik tuziladi.
- **Telegram Web**: `X-Frame-Options: SAMEORIGIN` Mini App'ni veb-mijozda to‘sardi; endi CSP `frame-ancestors` (faqat Telegram).
- **Javob sizib chiqishi**: rasmiy imtihondan keyin `is_correct` ro‘yxati qaytarilardi — yopildi.
- **Vaqt nazorati serverda**: muddat tugaganidan keyin (2 daqiqa imtiyoz) yuborilgan javoblar hisobga olinmaydi.
- **Imtihonni davom ettirish**: sahifa yopilsa, qurilmada saqlangan javoblar va server vaqti bo‘yicha davom etadi; rasmiy imtihonni qayta ochib savollarni almashtirib bo‘lmaydi.
- Yuborishda tarmoq xatosi bo‘lsa javoblar yo‘qolmaydi; ikki marta yuborish atomik himoyalangan.
- Adminlar bir-birini / super adminni o‘zgartira olmaydi; kirish muddati `access_from` ham tekshiriladi.
- Webhook endi `TELEGRAM_WEBHOOK_SECRET` bilan himoyalangan (oldin hamma POST yubora olardi).
- Admin: testni nashr qilish, savollar ro‘yxati/o‘chirish, JSON import, imtihon tayyorligi paneli, nomzod qidiruvi, rol berish.

## 1. Supabase

1. Supabase → **SQL Editor** → `supabase/schema.sql` mazmunini kiriting → Run. (Takroran ishga tushirish xavfsiz; v1.0 dan yangilaydi.)
2. Project Settings → API: Project URL va `service_role` kalitini oling (hech qachon frontendga/chatga qo‘ymang).

## 2. Netlify

1. Fayllarni GitHub'ga yuklang → Netlify → Import from Git. Build: `npm run build`, Publish: `public` (netlify.toml'da yozilgan).
2. Environment variables (`.env.example` ga qarang):

| O'zgaruvchi | Qiymat |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role kaliti |
| `TELEGRAM_BOT_TOKEN` | BotFather tokeni |
| `APP_SESSION_SECRET` | `openssl rand -hex 32` |
| `SUPERADMIN_TELEGRAM_IDS` | Super admin raqamli Telegram ID (vergul bilan) |
| `MINI_APP_URL` | `https://sayt-nomi.netlify.app` |
| `TELEGRAM_WEBHOOK_SECRET` | Faqat webhook ishlatilsa: `openssl rand -hex 24` |

3. **Trigger deploy**.

## 3. Telegram bot

1. BotFather: yangi token oling (chatda yuborilgan eski tokenni bekor qiling — `/revoke`).
2. `/setmenubutton` → URL = Netlify HTTPS manzili.
3. Ixtiyoriy `/start` webhook:
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d url=https://SAYT.netlify.app/.netlify/functions/bot-webhook -d secret_token=<TELEGRAM_WEBHOOK_SECRET>`

## 4. Birinchi administrator

`SUPERADMIN_TELEGRAM_IDS` ga raqamli ID kiriting. Shu ID bilan kirganda `super_admin` roli va tasdiqlangan holat avtomatik beriladi (mavjud foydalanuvchi bo‘lsa ham). Admin/super admin testlarni muddatsiz ishlay oladi.

## 5. Savol kiritish (Admin → Savollar)

Raqamlar **1 dan** boshlanadi. Savol tanlangan testning kompetensiyasiga avtomatik biriktiriladi.

| Tur | Variantlar maydoni | To‘g‘ri javob |
|---|---|---|
| **Y1** | variantlar, har biri yangi qatorda | variant raqami, masalan `2` |
| **Y2** | variantlar | raqamlar, masalan `1,3` |
| **Y3** | `Element => Juft` qatorlari | avtomatik (juftlar nomzodga aralashtirib ko‘rsatiladi) |
| **Y4** | elementlar **to‘g‘ri tartibda** | avtomatik (nomzodga aralashtirib ko‘rsatiladi) |

**JSON import** (200 tagacha):
```json
[
  {"type":"Y1","text":"Savol?","options":["A","B","C","D"],"correct":2,"explanation":"…","page_start":10,"page_end":11},
  {"type":"Y2","text":"…","options":["a","b","c"],"correct":"1,3"},
  {"type":"Y3","text":"Moslang","options":["Element A => Juft 1","Element B => Juft 2"]},
  {"type":"Y4","text":"Tartiblang","options":["1-qadam","2-qadam","3-qadam"]}
]
```
Savollarni testga qo‘shgach, “Testlar” bo‘limida **Nashr qilish** tugmasini bosing. Rasmiy imtihon uchun nashr qilingan testlarda kompetensiyalar bo‘yicha kamida 5/6/4/5/4/6 faol savol bo‘lishi kerak (panel holatni ko‘rsatadi).

## Ishga tushirishdan oldin biling

- Test banki bo‘sh: savollar uydirilmagan. Manbali savollar uchun kitob/boblar matni kerak.
- Nomzodlar ilovaga Telegram Mini App orqali kiradi. Administratorlar uchun `/admin/` manzilida alohida email/parol kirishi bor; parol tiklash uchun Supabase Auth URL Configuration’da Site URL va ruxsat etilgan Redirect URL ni shu `/admin/` manziliga sozlang.
- Y1–Y4 turlarining rasmiy imtihondagi aniq taqsimoti manbada ko‘rsatilmagan — savollar kompetensiya bo‘yicha tasodifiy tanlanadi.
- Nomzod javoblari shu qurilmada (localStorage) saqlanadi; boshqa qurilmada davom ettirilsa, savollar qaytadi, lekin belgilangan javoblar qaytmaydi.
- Mustaqil test vaqti serverda faqat `duration_minutes > 0` bo‘lsa nazorat qilinadi.

## Xavfsizlik

Telegram initData imzosi va muddati serverda tekshiriladi; web administrator sessiyasi 12 soatlik HttpOnly/Secure/SameSite cookie’da saqlanadi va har so‘rovda faol rol qayta tekshiriladi. RLS yoqilgan, client rollariga ruxsat yo‘q; javob kaliti nomzodga yuborilmaydi; CSP yoqilgan; xatolar foydalanuvchiga ichki tafsilotsiz qaytariladi.

## Test

`npm install && npm test` — baholash va savol quruvchi mantig‘i uchun birlik testlari.
