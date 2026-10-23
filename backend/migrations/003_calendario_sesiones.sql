-- La duración de los registros anteriores se completa en un paso separado:
-- no inferimos cuánto duró una sesión a partir de su hora de inicio.
ALTER TABLE public.sesiones ADD COLUMN "duracionMinutos" INTEGER;
ALTER TABLE public.sesiones ALTER COLUMN "duracionMinutos" SET DEFAULT 60;
ALTER TABLE public.sesiones ADD CONSTRAINT sesiones_duracion_check CHECK ("duracionMinutos" IN (30, 45, 60));

ALTER TABLE public.sesiones DROP CONSTRAINT sesiones_estado_check;
ALTER TABLE public.sesiones ADD CONSTRAINT sesiones_estado_check CHECK (estado IN ('Programada', 'Realizada', 'Cancelada'));
ALTER TABLE public.sesiones DROP CONSTRAINT sesiones_horario_unico;
-- Una cancelación queda registrada y permite reutilizar el mismo inicio.
CREATE UNIQUE INDEX sesiones_horario_unico ON public.sesiones ("usuarioId", fecha, horario) WHERE estado <> 'Cancelada';
