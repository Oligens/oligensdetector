-- Oligens Detector production billing/auth data model.
-- Apply in Supabase SQL Editor. Configure Supabase Auth SMTP with Gmail SMTP + Google App Password.

create table if not exists public.subscriptions (user_id uuid primary key references auth.users(id) on delete cascade, plan text not null default 'free' check (plan in ('free','flash','pro','gold')), status text not null default 'active' check (status in ('active','expired','cancelled','none')), billing_period text check (billing_period in ('month','year','lifetime')), current_period_end timestamptz, flash_started_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.usage_events (id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade, event_type text not null check (event_type in ('analysis','humanizer','report')), word_count integer not null default 0 check (word_count >= 0), created_at timestamptz not null default now());
create table if not exists public.promo_codes (code text primary key, plan text not null check (plan in ('flash','pro','gold')), duration_days integer, discount_percent numeric(5,2) not null default 0, max_redemptions integer, redeemed_count integer not null default 0, active boolean not null default true, expires_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.promo_redemptions (id bigint generated always as identity primary key, code text not null references public.promo_codes(code), user_id uuid not null references auth.users(id) on delete cascade, redeemed_at timestamptz not null default now(), unique(code, user_id));
create table if not exists public.payment_transactions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, provider text not null check (provider in ('zakapro','moncash','natcash')), plan text not null check (plan in ('flash','pro','gold')), billing_period text not null check (billing_period in ('month','year','lifetime')), amount numeric(12,2) not null check (amount >= 0), currency text not null default 'HTG', phone text, provider_reference text unique, status text not null default 'pending' check (status in ('pending','paid','failed','expired')), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.payment_transactions enable row level security;
drop policy if exists "users read own subscription" on public.subscriptions;
drop policy if exists "users read own usage" on public.usage_events;
drop policy if exists "users read own redemptions" on public.promo_redemptions;
drop policy if exists "users read own payments" on public.payment_transactions;
create policy "users read own subscription" on public.subscriptions for select using (auth.uid() = user_id);
create policy "users read own usage" on public.usage_events for select using (auth.uid() = user_id);
create policy "users read own redemptions" on public.promo_redemptions for select using (auth.uid() = user_id);
create policy "users read own payments" on public.payment_transactions for select using (auth.uid() = user_id);

create or replace function public.ensure_free_subscription() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.subscriptions(user_id) values (new.id) on conflict (user_id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription after insert on auth.users for each row execute function public.ensure_free_subscription();

create or replace function public.increment_promo_redemption(p_code text) returns void language plpgsql security definer set search_path = public as $$ begin update public.promo_codes set redeemed_count = redeemed_count + 1 where code = p_code; end; $$;
grant execute on function public.increment_promo_redemption(text) to service_role;

create or replace function public.consume_analysis(p_word_count integer) returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.subscriptions%rowtype; today_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into s from public.subscriptions where user_id = auth.uid() for update;
  if not found then insert into public.subscriptions(user_id) values(auth.uid()) returning * into s; end if;
  if s.plan in ('flash','pro','gold') and (s.status <> 'active' or (s.current_period_end is not null and now() >= s.current_period_end)) then update public.subscriptions set plan='free',status='active',billing_period=null,current_period_end=null,flash_started_at=null where user_id=auth.uid(); s.plan:='free'; end if;
  if s.plan='flash' and s.flash_started_at is not null and now() >= s.flash_started_at + interval '7 days' then update public.subscriptions set plan='free',status='active',billing_period=null,current_period_end=null,flash_started_at=null where user_id=auth.uid(); s.plan:='free'; end if;
  if s.plan='free' and p_word_count > 2500 then return jsonb_build_object('allowed',false,'code','WORD_LIMIT','max_words',2500,'plan',s.plan); end if;
  if s.plan='flash' then select count(*) into today_count from public.usage_events where user_id=auth.uid() and event_type='analysis' and created_at >= date_trunc('day',now()); if today_count>=1 then return jsonb_build_object('allowed',false,'code','DAILY_LIMIT','plan',s.plan,'remaining',0); end if; end if;
  insert into public.usage_events(user_id,event_type,word_count) values(auth.uid(),'analysis',greatest(p_word_count,0));
  return jsonb_build_object('allowed',true,'plan',s.plan);
end; $$;
grant execute on function public.consume_analysis(integer) to authenticated;
