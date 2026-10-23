-- Cambia las duraciones admitidas sin modificar sesiones ni sus importes.
-- Las versiones anteriores se conservan: el migrador aplica este cambio completo
-- en una transacción y lo revierte si hubiera registros incompatibles.
ALTER TABLE public.sesiones DROP CONSTRAINT sesiones_duracion_check;
ALTER TABLE public.sesiones ADD CONSTRAINT sesiones_duracion_check
  CHECK ("duracionMinutos" IN (30, 40, 50, 60));
