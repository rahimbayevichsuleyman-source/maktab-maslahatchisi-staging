# MAKTAB MASLAHATCHISI — v2.1 (web admin + Telegram Mini App)

## Muhim: loyiha ildizida ishlang
Bu ZIP **ichida qo‘shimcha `maslahatchi-miniapp` papkasi yo‘q**. `package.json`, `netlify.toml`, `public/`, `netlify/`, `supabase/` bir darajada. GitHub repository ildiziga aynan shu fayllarni joylashtiring.

## 1. Supabase SQL
Supabase → SQL Editor → `supabase/schema.sql` faylini to‘liq bajaring. Baza jadvali bo‘lmasa, deploy muvaffaqiyatli bo‘lsa ham ilova ishlamaydi. Ushbu skript mavjud ma'lumotlarni ataylab o‘chirmaydi.

## 2. Netlify — yangi GitHub deploy sozlamalari
- Base directory: **bo‘sh** (repository root)
- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`
- `netlify.toml` ham shu sozlamalarni o‘z ichiga oladi.

## 3. Netlify → Environment variables
Har bir o‘zgaruvchi **Production** deploy kontekstida va **Functions** scope’da ishlashi kerak. Maxfiy qiymatlarni hech qachon GitHub, chat yoki skrinshotga qo‘ymang.

| Nom | Izoh |
| --- | --- |
| `SUPABASE_URL` | `https://...supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server secret key; faqat Functions |
| `SUPABASE_ANON_KEY` | Supabase publishable/anon key; web admin login uchun Functions ishlatadi |
| `TELEGRAM_BOT_TOKEN` | BotFather tokeni |
| `APP_SESSION_SECRET` | Tasodifiy 64 belgili hex yoki uzunroq |
| `SUPER_ADMIN_TELEGRAM_ID` | Telegram raqamli ID (eski nom ishlaydi) |

`SUPERADMIN_TELEGRAM_IDS` ham qo‘llanadi. Ikki nomning birini kiritish kifoya.

## 4. Muammolarni 10 soniyada aniqlash
Deploy `Published` bo‘lgach quyidagi manzilni **oddiy brauzerda** oching:

`https://SIZNING-SAYTINGIZ.netlify.app/.netlify/functions/api`

- `CONFIG_OK` — majburiy muhit sozlamalari mavjud (baza ulanishini alohida tekshirish kerak).
- `CONFIG_MISSING` — javobda faqat yetishmayotgan o‘zgaruvchi **nomlari** ko‘rsatiladi.
- `ADMIN_ID_MISSING` — administrator Telegram ID yo‘q.
- `SUPABASE_URL_INVALID` — URL noto‘g‘ri.
- `SESSION_SECRET_TOO_SHORT` — maxfiy sessiya kaliti 32 belgidan qisqa.
- `404` — server funksiyasi deploy qilinmagan yoki yo‘li noto‘g‘ri.

Diagnostika hech qachon token, secret yoki parol qiymatini ko‘rsatmaydi. Agar `CONFIG_OK` chiqsa-yu Telegram ichida xato bo‘lsa, Supabase jadvalini va Telegram initData'ni tekshiring.

## 5. Telegram
BotFather → Menu Button → HTTPS Netlify manzili. Botdagi mini-ilovani Telegram ichidan oching; oddiy brauzer Telegram initData yubormaydi.

## 6. Web administrator paneli
1. `supabase/schema.sql` ni ishga tushiring. `mc_web_admins` jadvali web administratorlar uchun alohida ruxsat saqlaydi; jadvalga bevosita murojaat faqat server Functions orqali `service_role` yordamida amalga oshadi.
2. Supabase Dashboard → Authentication → URL Configuration bo‘limida **Site URL** va **Redirect URLs** ga saytingizning admin manzilini kiriting: `https://SAYTINGIZ.netlify.app/admin/`. Parol tiklash havolasi shu sahifaga qaytadi.
3. Supabase Auth → Users orqali administrator uchun tasdiqlangan email/parol hisobini yarating.
4. Foydalanuvchining Auth UUID qiymatini olib, SQL Editor da ruxsat bering:
   `insert into public.mc_web_admins(auth_user_id, role) values ('AUTH_USER_UUID', 'super_admin');`
   Keyingi xodimlar uchun `admin` rolini bering. Ruxsatni bekor qilish uchun `active=false` qiling yoki yozuvni olib tashlang.
5. Netlify sozlamalarida `SUPABASE_ANON_KEY` muhit qiymatini kiriting. Bu kalit Functions da email va parolni tekshiradi; `SUPABASE_SERVICE_ROLE_KEY` maxfiy qoladi va faqat Functions da ishlatiladi.
6. Saytda `/admin/` manzilini oching. **Parolni unutdingizmi?** orqali tiklash xatini yuborish va yangi parol o‘rnatish mumkin. **Foydalanuvchilar** bo‘limida Telegram foydalanuvchilarini qidirish, holat/rol va kirish muddatlarini boshqarish mumkin. **Adabiyotlar** bo‘limida adabiyot, muallif, sahifalar soni, tavsif va boblarni boshqarish; adabiyotni vaqtincha yashirish mumkin. Kirish sessiyasi 12 soat amal qiladi, `HttpOnly`, `Secure`, `SameSite=Strict` cookie orqali saqlanadi; API barcha murojaatlarda `mc_web_admins` ruxsatini qayta tekshiradi. Panelda administrator hisobini ochiq yaratish shakli mavjud emas.
## 7. Testlar
`npm test` — test logikasi va konfiguratsiya tekshiruvlari. Rasmiy imtihon: 30 savol, 80 daqiqa, 78 ball. Savollar bazasi ataylab bo‘sh: haqiqiy manbalarga asoslangan savollar admin tomonidan kiritilishi kerak.

## Cheklovlar
Ushbu paketda foydalanuvchi ro‘yxatdan o‘tishi, admin tasdiqlashi, test boshqaruvi, natijalar va adabiyotlar uchun kod mavjud. Biroq haqiqiy Supabase va Telegram hisoblari bilan end-to-end sinov qilinmagan. Bu **xatosiz ishlash kafolati emas**; muvaffaqiyatli build ham Supabase schema o‘rnatilganini bildirmaydi. Oldingi bot tokeni oshkor qilingan bo‘lsa, BotFather orqali bekor qiling.
