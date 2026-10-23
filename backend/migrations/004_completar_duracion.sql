-- Valor inicial editable para las sesiones anteriores, cuya duración no se
-- registraba. No representa una medición histórica de la atención realizada.
UPDATE public.sesiones SET "duracionMinutos" = 60 WHERE "duracionMinutos" IS NULL;
ALTER TABLE public.sesiones ALTER COLUMN "duracionMinutos" SET NOT NULL;
