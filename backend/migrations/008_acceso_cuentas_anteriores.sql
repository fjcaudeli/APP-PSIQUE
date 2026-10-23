-- Excepción autorizada para conservar el acceso de las cuentas anteriores.
-- La fecha del historial evita habilitar cuentas creadas después de activar
-- la confirmación, incluso si esta migración se ejecutara más adelante.
-- No equivale a haber verificado por correo la dirección de esas cuentas.
UPDATE public.usuarios
SET "emailConfirmado" = true
WHERE NOT "emailConfirmado"
  AND "fechaCreacion" < (
    SELECT "aplicadaEn" FROM public.migraciones WHERE version = 7
  );

-- El DEFAULT false de la migración 007 se conserva para todas las altas nuevas.
