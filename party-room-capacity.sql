-- FREE CHAT Party Room stage capacity
-- Run this once in Supabase SQL Editor before deploying the updated files.
ALTER TABLE public.voice_rooms
ADD COLUMN IF NOT EXISTS seat_capacity integer NOT NULL DEFAULT 6;

ALTER TABLE public.voice_rooms
DROP CONSTRAINT IF EXISTS voice_rooms_seat_capacity_check;

ALTER TABLE public.voice_rooms
ADD CONSTRAINT voice_rooms_seat_capacity_check
CHECK (seat_capacity IN (6, 8, 12, 20));
