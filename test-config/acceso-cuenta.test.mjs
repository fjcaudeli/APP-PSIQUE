import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

test('formularios de confirmación y recuperación conservan validación, errores y acceso pendiente', async t => {
  const base = resolve('out-tsc'); await mkdir(base, { recursive: true });
  const carpeta = await mkdtemp(join(base, 'cuenta-test-'));
  try {
    const destino = join(carpeta, 'cuenta.mjs');
    await build({ stdin: { contents: `
      export { RegistroPage } from './src/app/auth/registro.page';
      export { LoginPage } from './src/app/auth/login.page';
      export { SolicitarCorreoPage } from './src/app/auth/solicitar-correo.page';
      export { EnlaceCuentaPage } from './src/app/auth/enlace-cuenta.page';
      export { AuthService } from './src/app/services/auth.service';`, resolveDir: process.cwd(), loader: 'ts' },
      outfile: destino, bundle: true, format: 'esm', platform: 'browser', packages: 'external', tsconfig: 'tsconfig.json', logLevel: 'silent',
      plugins: [{ name: 'ionic-sin-dom', setup(b) {
        b.onResolve({ filter: /^@ionic\/angular$/ }, () => ({ path: 'ionic', namespace: 'prueba' }));
        b.onLoad({ filter: /.*/, namespace: 'prueba' }, () => ({ contents: 'export class IonContent {}', loader: 'js' }));
      } }],
    });
    const m = await import(pathToFileURL(destino).href);
    function crear(Clase, auth, confirmacion = false, fragment = 'token=' + 'a'.repeat(43)) {
      const viajes = [];
      const router = { getCurrentNavigation: () => null, navigateByUrl: (...args) => { viajes.push(args); return Promise.resolve(true); },
        navigate: (...args) => { viajes.push(args); return Promise.resolve(true); } };
      const inyector = createEnvironmentInjector([{ provide: FormBuilder, useValue: new FormBuilder() },
        { provide: m.AuthService, useValue: auth }, { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { confirmacion }, fragment } } }]);
      t.after(() => inyector.destroy());
      return { pagina: runInInjectionContext(inyector, () => new Clase()), viajes };
    }
    await t.test('registro pendiente limpia contraseñas y no navega al consultorio ni inicia sesión', () => {
      let altas = 0;
      const { pagina: p, viajes } = crear(m.RegistroPage, { registrarse: () => { altas++; return of({ usuario: { id: 1 }, correoEnviado: false }); } });
      p.formulario.setValue({ email: 'prueba@example.test', password: 'Clave larga ficticia', repetirPassword: 'Clave larga ficticia' });
      p.registrarse(); p.registrarse(); assert.equal(altas, 1); assert.equal(p.cuentaCreada, true); assert.equal(p.correoEnviado, false);
      assert.equal(p.formulario.controls.password.value, ''); assert.deepEqual(viajes, []);
    });
    await t.test('login informa email no confirmado y conserva la pantalla pública', () => {
      const { pagina: p, viajes } = crear(m.LoginPage, { iniciarSesion: () => throwError(() => new HttpErrorResponse({ status: 403, error: { mensaje: 'Confirmá tu email.' } })) });
      p.formulario.setValue({ email: 'prueba@example.test', password: 'Clave ficticia' }); p.entrar();
      assert.equal(p.error, 'Confirmá tu email.'); assert.deepEqual(viajes, []);
    });
    await t.test('recuperación valida email y el reenvío conserva los errores 429 y 503', () => {
      const { pagina: p } = crear(m.SolicitarCorreoPage, { solicitarRecuperacion: () => of({ mensaje: 'Respuesta neutra' }) });
      p.formulario.controls.email.setValue('inválido'); p.enviar(); assert.equal(p.mensaje, '');
      p.formulario.controls.email.setValue('prueba@example.test'); p.enviar(); assert.equal(p.mensaje, 'Respuesta neutra');
      for (const status of [429, 503]) {
        const { pagina: reenvio } = crear(m.SolicitarCorreoPage, { reenviarConfirmacion: () => throwError(() => new HttpErrorResponse({ status, error: { mensaje: 'Esperá antes de reintentar.' } })) }, true);
        reenvio.formulario.controls.email.setValue('prueba@example.test'); reenvio.enviar(); assert.equal(reenvio.error, 'Esperá antes de reintentar.');
      }
    });
    await t.test('la confirmación requiere un clic explícito y no consume enlaces incompletos', () => {
      let confirmaciones = 0;
      const auth = { confirmarEmail: () => { confirmaciones++; return of({ mensaje: 'Email confirmado' }); } };
      const { pagina: p } = crear(m.EnlaceCuentaPage, auth, true); assert.equal(confirmaciones, 0);
      p.enviar(); p.enviar(); assert.equal(confirmaciones, 1); assert.equal(p.completado, true);
      const { pagina: incompleta } = crear(m.EnlaceCuentaPage, auth, true, 'token=corto'); incompleta.enviar();
      assert.equal(confirmaciones, 1); assert.equal(incompleta.enlaceValido, false);
    });
    await t.test('la nueva contraseña respeta 12–128, exige repetición y conserva el borrador si falla', () => {
      let llamadas = 0;
      const { pagina: p } = crear(m.EnlaceCuentaPage, { restablecerPassword: () => { llamadas++; return throwError(() => new HttpErrorResponse({ status: 400, error: { mensaje: 'El enlace venció.' } })); } });
      for (const [password, repetirPassword] of [['corta', 'corta'], ['x'.repeat(129), 'x'.repeat(129)], ['Clave larga ficticia', 'Distinta']]) {
        p.formulario.setValue({ password, repetirPassword }); p.enviar();
      }
      assert.equal(llamadas, 0);
      p.formulario.setValue({ password: 'Clave larga ficticia', repetirPassword: 'Clave larga ficticia' }); p.enviar();
      assert.equal(llamadas, 1); assert.equal(p.error, 'El enlace venció.'); assert.equal(p.formulario.controls.password.value, 'Clave larga ficticia');
    });
  } finally { assert.equal(resolve(carpeta, '..'), base); await rm(carpeta, { recursive: true }); }
});
