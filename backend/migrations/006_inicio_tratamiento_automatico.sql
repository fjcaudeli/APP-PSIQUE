-- El inicio representa la primera sesión efectivamente realizada. Una reserva
-- futura o una ficha recién creada todavía no tienen fecha de inicio.
ALTER TABLE public.pacientes ALTER COLUMN "fechaInicioTratamiento" DROP NOT NULL;
UPDATE public.pacientes p SET "fechaInicioTratamiento" = (
  SELECT min(s.fecha) FROM public.sesiones s
  WHERE s."usuarioId" = p."usuarioId" AND s."codigoPaciente" = p.codigo
    AND s.estado = 'Realizada'
);
