-- Once the DNS content filter is on, a user can't switch it off (or point it at another host) by saving new
-- rules: the latest rules row (including one dated tomorrow) decides. Only the server may change it.
create or replace function public.guard_dns_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prev jsonb;
  default_host constant text := 'family.adguard-dns.com';
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  select r.rules into prev
  from public.rules r
  where r.user_id = new.user_id
  order by r.effective_date desc, r.created_at desc
  limit 1;
  if prev is not null and coalesce((prev -> 'dns' ->> 'lock')::boolean, false) then
    if not coalesce((new.rules -> 'dns' ->> 'lock')::boolean, false)
       or lower(coalesce(new.rules -> 'dns' ->> 'host', default_host)) <> lower(coalesce(prev -> 'dns' ->> 'host', default_host)) then
      raise exception 'The content filter (DNS lock) is on. It can''t be turned off or changed by editing rules; keep "dns": {"lock": true, "host": "%"}.',
        coalesce(prev -> 'dns' ->> 'host', default_host);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rules_guard_dns on public.rules;
create trigger rules_guard_dns before insert on public.rules
  for each row execute function public.guard_dns_lock();

-- The host a device was last verified against. A "DNS changed" penalty applies only when the device was
-- compliant with the *current* required host and then isn't, so changing dns.host in the rules never
-- charges a phone that didn't touch its settings.
alter table public.devices add column if not exists dns_ok_host text;
