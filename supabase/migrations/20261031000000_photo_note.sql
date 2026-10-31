-- A shared reef photo may carry a short note from the diver (up to 40 words, checked by the intake function).
alter table public.portfolio_photos add column if not exists note text check (length(note) <= 400);
