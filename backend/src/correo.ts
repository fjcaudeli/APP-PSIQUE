import { ErrorConfiguracionPostgres } from './db/seguridad-postgres.ts';

export interface MensajeCorreo { para: string; asunto: string; texto: string }
export interface Correo {
  habilitado: boolean;
  enviar(mensaje: MensajeCorreo): Promise<void>;
}

// No se simula un envío exitoso cuando falta configurar el proveedor.
export const correoSinConfigurar: Correo = {
  habilitado: false,
  async enviar() { throw new Error('El envío de correo no está configurado.'); },
};

// Solo se activa al elegir explícitamente el proveedor en el entorno privado.
// fetch ya pertenece a Node: no incorporamos SDK ni dependencias adicionales.
export function configurarCorreo(entorno: NodeJS.ProcessEnv = process.env, solicitar: typeof fetch = fetch): Correo {
  const proveedor = entorno['CORREO_PROVEEDOR']?.trim();
  if (!proveedor) return correoSinConfigurar;
  if (proveedor !== 'resend') throw new ErrorConfiguracionPostgres('CORREO_PROVEEDOR no es válido.');
  const clave = entorno['RESEND_API_KEY'];
  const remitente = entorno['CORREO_REMITENTE']?.trim();
  const destinatarioPrueba = entorno['CORREO_DESTINATARIO_PRUEBA']?.trim().toLowerCase();
  if (!clave?.trim() || !remitente || remitente.length > 320 || /[\r\n]/.test(remitente)
      || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(remitente.includes('<') ? remitente.match(/<([^<>]+)>$/)?.[1] ?? '' : remitente)) {
    throw new ErrorConfiguracionPostgres('Configurá RESEND_API_KEY y CORREO_REMITENTE de forma privada para habilitar el correo.');
  }
  if (destinatarioPrueba && (destinatarioPrueba.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(destinatarioPrueba))) {
    throw new ErrorConfiguracionPostgres('CORREO_DESTINATARIO_PRUEBA debe ser un email válido.');
  }
  return { habilitado: true, async enviar(mensaje) {
    try {
      // En la prueba sin dominio solo se permite el destinatario autorizado.
      // Nunca redirigimos a ese email los enlaces pertenecientes a otra cuenta.
      if (destinatarioPrueba && mensaje.para.toLowerCase() !== destinatarioPrueba) throw new Error();
      const respuesta = await solicitar('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: 'Bearer ' + clave, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: remitente, to: [mensaje.para], subject: mensaje.asunto, text: mensaje.texto }),
      });
      if (!respuesta.ok) { await respuesta.body?.cancel(); throw new Error(); }
      const enviado = await respuesta.json() as { id?: unknown };
      if (typeof enviado.id !== 'string' || !enviado.id) throw new Error();
    } catch {
      // Nunca propagamos cuerpos del proveedor ni errores que contengan secretos.
      throw new Error('No se pudo enviar el correo de acceso.');
    }
  } };
}
