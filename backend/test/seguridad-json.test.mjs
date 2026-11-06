import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { setTimeout as esperar } from 'node:timers/promises';

test('parser JSON: conserva contratos, límite descomprimido y proceso ante un gzip con bytes sobrantes', { timeout: 15000 }, async t => {
  const entorno = { ...process.env };
  for (const variable of ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'APP_DATABASE_URL', 'TEST_DATABASE_URL',
    'JWT_SECRET', 'RESEND_API_KEY', 'CORREO_PROVEEDOR', 'NODE_TEST_CONTEXT']) delete entorno[variable];
  const hijo = fork(new URL('./fixtures/servidor-json.mjs', import.meta.url), [], {
    env: entorno, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let errores = '';
  hijo.stderr.on('data', datos => { errores += datos; });
  t.after(async () => {
    if (hijo.exitCode !== null || hijo.signalCode !== null) return;
    const terminado = once(hijo, 'exit');
    if (hijo.connected) hijo.send('cerrar');
    const limite = setTimeout(() => hijo.kill(), 2000);
    try { await terminado; } finally { clearTimeout(limite); }
  });
  const listo = await Promise.race([
    once(hijo, 'message').then(([mensaje]) => mensaje),
    once(hijo, 'exit').then(() => { throw new Error('El servidor aislado no pudo iniciar.'); }),
  ]);
  const base = `http://127.0.0.1:${listo.puerto}`;
  async function enviar(body, gzip = false) {
    const respuesta = await fetch(base + '/api/auth/login', {
      method: 'POST', signal: AbortSignal.timeout(3000),
      headers: { 'Content-Type': 'application/json', ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) }, body,
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }
  const valido = await enviar('{}');
  assert.equal(valido.status, 400); // JSON válido; faltan las credenciales del login.
  assert.deepEqual(await enviar(gzipSync('{}'), true), valido);
  assert.deepEqual(await enviar('{"email":'), {
    status: 400, body: { mensaje: 'El cuerpo de la solicitud debe contener JSON válido.' },
  });
  const grande = JSON.stringify({ texto: 'x'.repeat(33 * 1024) });
  const excesivo = { status: 413, body: { mensaje: 'La ficha enviada supera el tamaño permitido de 32 KB.' } };
  assert.deepEqual(await enviar(grande), excesivo);
  assert.deepEqual(await enviar(gzipSync(grande), true), excesivo);

  // Caso funcional de entrada comprimida inválida: comprobamos que el servidor
  // siga respondiendo. Este caso no demuestra por sí solo un aviso de seguridad.
  const sobrantes = Buffer.concat([gzipSync('{}'), Buffer.from('trailer-invalido')]);
  try { await enviar(sobrantes, true); } catch (error) {
    // El transporte puede cerrarse al rechazar una codificación inválida. Lo
    // indispensable es que el servidor siga atendiendo y no exponga detalles.
    assert.ok(error instanceof TypeError || error.name === 'TimeoutError');
  }
  await esperar(100);
  assert.equal(hijo.exitCode, null, 'El parser terminó el proceso aislado: ' + errores);
  assert.equal(hijo.signalCode, null);
  const salud = await fetch(base + '/health/live', { signal: AbortSignal.timeout(3000) });
  assert.equal(salud.status, 200);
  assert.deepEqual(await salud.json(), { estado: 'ok' });
  assert.deepEqual(await enviar('{}'), valido);
  assert.equal(errores, '', 'No debe quedar un error sin manejar ni datos del parser en stderr.');
});
