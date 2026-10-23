import test from 'node:test';
import assert from 'node:assert/strict';
import { configurarCorreo } from '../dist/correo.js';

test('correo sin configuración queda deshabilitado y los errores de configuración no revelan claves', () => {
  assert.equal(configurarCorreo({}).habilitado, false);
  for (const entorno of [{ CORREO_PROVEEDOR: 'otro' }, { CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 'secreto-ficticio' },
    { CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 'secreto-ficticio', CORREO_REMITENTE: 'invalido' }]) {
    assert.throws(() => configurarCorreo(entorno), error => !error.message.includes('secreto-ficticio'));
  }
});

test('adaptador HTTPS usa solo el endpoint fijo, texto, timeout y credenciales privadas; no sigue redirecciones', async () => {
  let recibida;
  const correo = configurarCorreo({ CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 'clave-ficticia', CORREO_REMITENTE: 'PSIQUE <acceso@example.test>' }, async (url, opciones) => {
    recibida = { url, opciones }; return Response.json({ id: 'envio-ficticio' });
  });
  await correo.enviar({ para: 'usuario@example.test', asunto: 'Asunto', texto: 'Texto de prueba' });
  assert.equal(recibida.url, 'https://api.resend.com/emails'); assert.equal(recibida.opciones.redirect, 'error');
  assert.equal(recibida.opciones.headers.Authorization, 'Bearer clave-ficticia');
  assert.deepEqual(JSON.parse(recibida.opciones.body), { from: 'PSIQUE <acceso@example.test>', to: ['usuario@example.test'], subject: 'Asunto', text: 'Texto de prueba' });
  assert.ok(recibida.opciones.signal instanceof AbortSignal);
});

test('errores HTTP y de red no revelan respuesta del proveedor, destinatario, token ni API key', async () => {
  for (const solicitar of [async () => new Response('detalle secreto del proveedor', { status: 403 }),
    async () => { throw new Error('detalle secreto de red'); }, async () => Response.json({})]) {
    const correo = configurarCorreo({ CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 'clave-ficticia', CORREO_REMITENTE: 'acceso@example.test' }, solicitar);
    await assert.rejects(correo.enviar({ para: 'usuario@example.test', asunto: 'Acceso', texto: 'enlace-ficticio' }),
      { message: 'No se pudo enviar el correo de acceso.' });
  }
});

test('la prueba sin dominio solo envía al email autorizado y nunca redirige enlaces de otras cuentas', async () => {
  const enviados = [];
  const correo = configurarCorreo({ CORREO_PROVEEDOR: 'resend', RESEND_API_KEY: 'clave-ficticia',
    CORREO_REMITENTE: 'PSIQUE <onboarding@resend.dev>', CORREO_DESTINATARIO_PRUEBA: 'propio@example.test' }, async (_url, opciones) => {
    enviados.push(JSON.parse(opciones.body)); return Response.json({ id: 'ficticio' });
  });
  await assert.rejects(correo.enviar({ para: 'ajeno@example.test', asunto: 'Acceso', texto: 'Enlace ajeno' }));
  assert.equal(enviados.length, 0);
  await correo.enviar({ para: 'propio@example.test', asunto: 'Acceso', texto: 'Enlace propio' });
  assert.deepEqual(enviados.map(e => e.to), [['propio@example.test']]);
});
