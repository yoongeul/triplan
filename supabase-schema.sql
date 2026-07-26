-- Supabase SQL Editor에서 실행하세요.

create table if not exists trips (
  room_code text primary key,
  name text not null default '우리들의 여행',
  family_a_name text not null default '가족 A',
  family_b_name text not null default '가족 B',
  created_at timestamptz not null default now()
);

create table if not exists trip_categories (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references trips(room_code) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(room_code, name)
);

create table if not exists trip_items (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references trips(room_code) on delete cascade,
  section_type text not null default 'plan',
  schedule_date date,
  schedule_time time,
  schedule_place text not null default '',
  title text not null,
  category_name text not null,
  owner text not null default '',
  note text not null default '',
  done boolean not null default false,

  reservation_required boolean not null default false,
  reservation_done boolean not null default false,
  reservation_date date,
  reservation_time time,
  reservation_place text not null default '',
  reservation_number text not null default '',
  reservation_note text not null default '',
  reservation_image_url text not null default '',

  created_at timestamptz not null default now()
);

alter table trips enable row level security;
alter table trip_categories enable row level security;
alter table trip_items enable row level security;

-- 가족끼리 여행 코드만 공유하는 간단한 MVP용 정책입니다.
-- 실제 서비스에서는 로그인과 초대 권한을 추가하는 것이 안전합니다.
create policy "mvp trips all" on trips for all using (true) with check (true);
create policy "mvp categories all" on trip_categories for all using (true) with check (true);
create policy "mvp items all" on trip_items for all using (true) with check (true);

alter publication supabase_realtime add table trips;
alter publication supabase_realtime add table trip_categories;
alter publication supabase_realtime add table trip_items;


create table if not exists trip_participants (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references trips(room_code) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(room_code, name)
);

alter table trip_participants enable row level security;
create policy "mvp participants all" on trip_participants for all using (true) with check (true);
alter publication supabase_realtime add table trip_participants;


-- 기존 trip_items 테이블에 계획/일정 기능 추가
alter table trip_items add column if not exists section_type text not null default 'plan';
alter table trip_items add column if not exists schedule_date date;
alter table trip_items add column if not exists schedule_time time;
alter table trip_items add column if not exists schedule_place text not null default '';


-- 기존 trip_items 테이블에 예약 사진 필드 추가
alter table trip_items
add column if not exists reservation_image_url text not null default '';

-- 예약 사진 저장용 공개 Storage 버킷
insert into storage.buckets (id, name, public)
values ('trip-attachments', 'trip-attachments', true)
on conflict (id) do update set public = true;

create policy "mvp attachment read"
on storage.objects for select
using (bucket_id = 'trip-attachments');

create policy "mvp attachment upload"
on storage.objects for insert
with check (bucket_id = 'trip-attachments');

create policy "mvp attachment update"
on storage.objects for update
using (bucket_id = 'trip-attachments')
with check (bucket_id = 'trip-attachments');

create policy "mvp attachment delete"
on storage.objects for delete
using (bucket_id = 'trip-attachments');
