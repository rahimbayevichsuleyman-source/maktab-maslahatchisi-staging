-- MAKTAB MASLAHATCHISI: mustaqil sxema (v1.1). Supabase SQL Editor'da to'liq ishga tushiring.
-- Skript takroran ishga tushirilsa ham xavfsiz (idempotent): eski o'rnatishni yangilaydi.
create extension if not exists pgcrypto;

create table if not exists public.mc_competencies (
 id uuid primary key default gen_random_uuid(), code text unique not null, title text not null, group_name text not null,
 question_target integer not null, point_value numeric(4,1) not null, sort_order integer not null, active boolean not null default true
);
insert into public.mc_competencies(code,title,group_name,question_target,point_value,sort_order) values
('c1','Tashkiliy-pedagogik va kommunikativ ko‘nikmalar','Asosiy kompetensiyalar',5,3.1,1),
('c2','O‘quvchini qo‘llab-quvvatlash va kasbga yo‘naltirish ko‘nikmalari','Asosiy kompetensiyalar',6,3.1,2),
('c3','Liderlik va tashabbuskorlik ko‘nikmalari','Asosiy kompetensiyalar',4,3.1,3),
('c4','Ta’lim siyosati va davlat tilida hujjat yuritish ko‘nikmalari','Qo‘llab-quvvatlovchi kompetensiyalar',5,2.1,4),
('c5','Raqamli savodxonlik va axborot madaniyati ko‘nikmalari','Qo‘llab-quvvatlovchi kompetensiyalar',4,2.1,5),
('c6','Ingliz tili bo‘yicha ko‘nikmalar','Qo‘llab-quvvatlovchi kompetensiyalar',6,2.1,6)
on conflict(code) do update set title=excluded.title,group_name=excluded.group_name,question_target=excluded.question_target,point_value=excluded.point_value,sort_order=excluded.sort_order;

create table if not exists public.mc_users (
 id uuid primary key default gen_random_uuid(), telegram_id text unique not null, username text, full_name text not null,
 phone text, organization text, position text, role text not null default 'candidate' check(role in ('super_admin','admin','manager','consultant','candidate')),
 status text not null default 'pending' check(status in ('pending','approved','rejected','blocked')),
 access_from timestamptz, access_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Web administrator accounts are provisioned manually through Supabase Auth.
-- Only a row in this table grants access to the standalone web panel.
create table if not exists public.mc_web_admins (
 auth_user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('super_admin','admin')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.mc_literature (
 id uuid primary key default gen_random_uuid(), title text not null, author text, total_pages integer, description text,
 competency_id uuid references public.mc_competencies(id), active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.mc_chapters (
 id uuid primary key default gen_random_uuid(), literature_id uuid not null references public.mc_literature(id) on delete cascade,
 chapter_number integer not null default 1, title text not null, sort_order integer not null default 1, created_at timestamptz not null default now()
);
create table if not exists public.mc_tests (
 id uuid primary key default gen_random_uuid(), title text not null, description text,
 competency_id uuid not null references public.mc_competencies(id), literature_id uuid references public.mc_literature(id) on delete set null,
 chapter_id uuid references public.mc_chapters(id) on delete set null, mode text not null default 'practice' check(mode in ('practice','official')),
 duration_minutes integer not null default 0, is_published boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.mc_questions (
 id uuid primary key default gen_random_uuid(), test_id uuid not null references public.mc_tests(id) on delete cascade,
 competency_id uuid not null references public.mc_competencies(id), question_text text not null,
 question_type text not null default 'Y1' check(question_type in ('Y1','Y2','Y3','Y4')),
 options jsonb not null default '[]'::jsonb, correct_answer jsonb not null, explanation text,
 points numeric(5,2) not null default 1, sort_order integer not null default 1,
 source_page_start integer, source_page_end integer, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.mc_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.mc_users(id) on delete cascade,
 mode text not null, test_id uuid references public.mc_tests(id) on delete set null, test_title text not null,
 question_ids uuid[] not null, max_score numeric(7,2) not null, question_count integer not null,
 score numeric(7,2), percentage numeric(5,1), correct_count integer, elapsed_seconds integer,
 status text not null default 'in_progress' check(status in ('in_progress','completed','cancelled')),
 started_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.mc_attempt_answers (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null references public.mc_attempts(id) on delete cascade,
 question_id uuid not null references public.mc_questions(id), answer jsonb, is_correct boolean not null, points_awarded numeric(7,2) not null default 0,
 created_at timestamptz not null default now(), unique(attempt_id,question_id)
);
create table if not exists public.mc_settings (key text primary key, value jsonb not null default 'false'::jsonb);
insert into public.mc_settings(key,value) values('practice_answers_released','false'::jsonb) on conflict(key) do nothing;

-- v1.1 qo'shimchalari: har bir urinish uchun savol ballari (rasmiy imtihon 3.1 / 2.1) va davomiylik.
alter table public.mc_attempts add column if not exists question_points jsonb not null default '{}'::jsonb;
alter table public.mc_attempts add column if not exists duration_minutes integer not null default 0;
alter table public.mc_attempt_answers add column if not exists points_possible numeric(7,2);

-- Indekslar
create index if not exists mc_attempts_user_idx on public.mc_attempts(user_id, completed_at desc);
create index if not exists mc_attempts_open_idx on public.mc_attempts(user_id, mode, status);
create index if not exists mc_questions_test_idx on public.mc_questions(test_id) where active;
create index if not exists mc_questions_comp_idx on public.mc_questions(competency_id) where active;
create index if not exists mc_answers_attempt_idx on public.mc_attempt_answers(attempt_id);
create index if not exists mc_chapters_lit_idx on public.mc_chapters(literature_id);
create index if not exists mc_tests_pub_idx on public.mc_tests(is_published);

-- updated_at avtomatik yangilanishi
create or replace function public.mc_touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists mc_users_touch on public.mc_users;
create trigger mc_users_touch before update on public.mc_users for each row execute function public.mc_touch_updated_at();

-- Xavfsizlik: RLS yoqilgan, client rollariga ruxsat yo'q; backend service_role orqali ishlaydi.
alter table public.mc_competencies enable row level security;
alter table public.mc_users enable row level security;
alter table public.mc_literature enable row level security;
alter table public.mc_chapters enable row level security;
alter table public.mc_tests enable row level security;
alter table public.mc_questions enable row level security;
alter table public.mc_attempts enable row level security;
alter table public.mc_attempt_answers enable row level security;
alter table public.mc_settings enable row level security;
alter table public.mc_web_admins enable row level security;
revoke all on public.mc_competencies,public.mc_users,public.mc_literature,public.mc_chapters,public.mc_tests,public.mc_questions,public.mc_attempts,public.mc_attempt_answers,public.mc_settings from anon, authenticated;
revoke all on public.mc_web_admins from anon, authenticated;
grant all on public.mc_competencies,public.mc_users,public.mc_literature,public.mc_chapters,public.mc_tests,public.mc_questions,public.mc_attempts,public.mc_attempt_answers,public.mc_settings to service_role;
grant all on public.mc_web_admins to service_role;

-- Kompetensiya bo'yicha o'zlashtirish: maxraj sifatida urinishdagi haqiqiy mumkin bo'lgan ball olinadi.
create or replace view public.mc_user_competency_stats with (security_invoker = true) as
select a.user_id, q.competency_id,
       case when sum(coalesce(aa.points_possible,q.points))=0 then 0
            else round((sum(aa.points_awarded)/sum(coalesce(aa.points_possible,q.points)))*100,1) end as percentage,
       count(distinct a.id) as attempts_count
from public.mc_attempts a
join public.mc_attempt_answers aa on aa.attempt_id=a.id
join public.mc_questions q on q.id=aa.question_id
where a.status='completed'
group by a.user_id,q.competency_id;
revoke all on public.mc_user_competency_stats from anon, authenticated;
grant select on public.mc_user_competency_stats to service_role;
