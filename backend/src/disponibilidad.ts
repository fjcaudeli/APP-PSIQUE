import type { Express } from 'express';

export function configurarDisponibilidad(app: Express, comprobar: () => Promise<unknown>) {
  let pendiente: Promise<void> | undefined;
  let disponible = false;
  let vence = 0;
  app.get('/health/live', (_req, res) => { res.json({ estado: 'ok' }); });
  app.get('/health/ready', async (_req, res) => {
    if (Date.now() >= vence && !pendiente) {
      // Una única consulta en vuelo, resultado compartido 5 s y respuesta acotada
      // a 1,5 s. Un timeout no dispara más consultas mientras la anterior continúa.
      pendiente = Promise.resolve().then(comprobar).then(() => { disponible = true; }, () => { disponible = false; })
        .finally(() => { vence = Date.now() + 5000; pendiente = undefined; });
    }
    if (pendiente) {
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([pendiente, new Promise<void>(resolver => {
        temporizador = setTimeout(() => { disponible = false; resolver(); }, 1500);
      })]);
      clearTimeout(temporizador);
    }
    res.status(disponible ? 200 : 503).json({ estado: disponible ? 'ok' : 'no_disponible' });
  });
}
