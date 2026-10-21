import cors from 'cors';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import type { Express } from 'express';

export interface SeguridadHttp { produccion?: boolean; proxies?: string[] }

export function configurarSeguridadHttp(app: Express, origen: string, opciones: SeguridadHttp = {}) {
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', opciones.proxies?.length ? opciones.proxies : false);
  app.use(helmet({
    // Express sirve JSON. Esta CSP no afecta al sitio estático de Ionic/Angular.
    contentSecurityPolicy: { useDefaults: false, directives: {
      defaultSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'none'"],
    } },
    strictTransportSecurity: opciones.produccion ? { maxAge: 31536000 } : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache', Expires: '0' });
    next();
  });
  app.use((req, res, next) => {
    const solicitado = req.get('Origin');
    const metodo = req.get('Access-Control-Request-Method');
    const encabezados = req.get('Access-Control-Request-Headers')?.split(',').map(h => h.trim().toLowerCase());
    if ((solicitado !== undefined && solicitado !== origen)
        || (req.method === 'OPTIONS' && ((metodo && !['GET', 'POST', 'PUT'].includes(metodo))
          || encabezados?.some(h => !['authorization', 'content-type'].includes(h))))) {
      res.status(403).json({ mensaje: 'Origen o solicitud CORS no autorizados.' }); return;
    }
    next();
  });
  // cors refleja únicamente los encabezados solicitados, ya validados arriba.
  app.use(cors({ origin: origen, methods: ['GET', 'POST', 'PUT'], credentials: false }));
}

export function limitarAutenticacion(limite: number, ventanaMs: number) {
  return rateLimit({
    limit: limite, windowMs: ventanaMs, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { mensaje: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.' },
    // req.ip solo incorpora X-Forwarded-For cuando el socket es un proxy autorizado.
    // Agrupamos IPv6 /56 y no registramos ni emails, ni IP, ni contraseñas.
    keyGenerator: req => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'sin-ip'),
  });
}
