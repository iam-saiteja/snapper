-- A new device hasn't been seen with the blocker on yet. Defaulting to true meant the first
-- sync (before Accessibility was enabled) looked like "blocker turned off" and cost 50 points.
-- The penalty now only applies after the device has reported the blocker on at least once.
alter table public.devices alter column a11y_enabled set default false;
