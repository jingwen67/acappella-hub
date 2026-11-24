create table public.showcase_settings (id boolean primary key default true check(id), opened boolean not null default false);
insert into public.showcase_settings values(true,false);
create table public.showcase_vouchers (code text primary key default upper(replace(gen_random_uuid()::text,'-','')), full_name text not null, email text unique not null, created_at timestamptz not null default now(), redeemed_at timestamptz);
alter table public.showcase_settings enable row level security;
alter table public.showcase_vouchers enable row level security;
revoke all on public.showcase_settings,public.showcase_vouchers from anon,authenticated;
grant select,insert,update on public.showcase_settings,public.showcase_vouchers to service_role;
create function public.showcase_pass(a text,n text,e text,c text,o boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.showcase_vouchers%rowtype; opened_now boolean; total integer;
begin
select opened into opened_now from public.showcase_settings where id=true for update;
select count(*) into total from public.showcase_vouchers;
if a='status' then return jsonb_build_object('open',opened_now,'remaining',60-total);
elsif a='toggle' then update public.showcase_settings set opened=o where id=true; return jsonb_build_object('open',o);
elsif a='list' then return jsonb_build_object('open',opened_now,'remaining',60-total,'rows',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb) from public.showcase_vouchers t));
elsif a='claim' then
if not opened_now then return jsonb_build_object('error','Claiming is closed'); end if;
if exists(select 1 from public.showcase_vouchers where email=e) then return jsonb_build_object('error','Email already used. Contact event staff if you lost your pass.'); end if;
if total>=60 then return jsonb_build_object('error','All 60 passes claimed'); end if;
insert into public.showcase_vouchers(full_name,email) values(n,e) returning * into v;
elsif a in ('ticket','lookup','redeem') then
select * into v from public.showcase_vouchers where code=c for update;
if not found then return jsonb_build_object('error','Invalid voucher'); end if;
if a='redeem' then
if v.redeemed_at is not null then return jsonb_build_object('error','Already redeemed'); end if;
update public.showcase_vouchers set redeemed_at=now() where code=c returning * into v;
end if;
else return jsonb_build_object('error','Invalid action'); end if;
return jsonb_build_object('name',v.full_name,'code',v.code,'redeemed',v.redeemed_at is not null);
end $$;
revoke all on function public.showcase_pass(text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.showcase_pass(text,text,text,text,boolean) to service_role;