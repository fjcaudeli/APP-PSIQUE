-- Los tokens originales solo se envían por correo; la base conserva su SHA-256.
ALTER TABLE public.usuarios
  ADD COLUMN "emailConfirmado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "versionCredenciales" INTEGER NOT NULL DEFAULT 0 CHECK ("versionCredenciales" >= 0),
  ADD COLUMN "confirmacionHash" TEXT UNIQUE,
  ADD COLUMN "confirmacionVence" TIMESTAMPTZ,
  ADD COLUMN "recuperacionHash" TEXT UNIQUE,
  ADD COLUMN "recuperacionVence" TIMESTAMPTZ,
  ADD CONSTRAINT usuarios_confirmacion_check CHECK (
    ("confirmacionHash" IS NULL AND "confirmacionVence" IS NULL)
    OR ("confirmacionHash" IS NOT NULL AND "confirmacionHash" ~ '^[0-9a-f]{64}$' AND "confirmacionVence" IS NOT NULL)
  ),
  ADD CONSTRAINT usuarios_recuperacion_check CHECK (
    ("recuperacionHash" IS NULL AND "recuperacionVence" IS NULL)
    OR ("recuperacionHash" IS NOT NULL AND "recuperacionHash" ~ '^[0-9a-f]{64}$' AND "recuperacionVence" IS NOT NULL)
  );
