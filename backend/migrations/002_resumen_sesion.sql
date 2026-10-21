-- Una sesión puede conservar una referencia breve; las existentes quedan sin resumen.
ALTER TABLE public.sesiones
  ADD COLUMN resumen TEXT NOT NULL DEFAULT '',
  ADD CONSTRAINT sesiones_resumen_check CHECK (char_length(resumen) <= 100);
