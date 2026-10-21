import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild'; // Ya utilizado por el compilador de Angular.
import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { HttpRequest, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { validarUrlApi } from '../src/environments/configuracion-api.ts';

test('configuración API: local conservada, producción HTTPS obligatoria sin fallback ni credenciales', () => {
  assert.equal(validarUrlApi('http://127.0.0.1:3000/api', false), 'http://127.0.0.1:3000/api');
  assert.equal(validarUrlApi('https://api.example.test/api/', true), 'https://api.example.test/api');
  for (const valor of [undefined, '', 'http://api.example.test/api', 'https://localhost/api', 'https://127.0.0.1/api',
    'https://api.example.test/', 'https://usuario:secreto@api.example.test/api', 'https://api.example.test/api?token=secreto']) {
    assert.throws(() => validarUrlApi(valor, true), /PSIQUE_API_URL/);
  }
});

test('compilación de producción incompleta falla antes de invocar Angular y no imprime el valor inválido', () => {
  const resultado = spawnSync(process.execPath, ['scripts/compilar-produccion.mjs'], {
    env: { ...process.env, PSIQUE_API_URL: 'https://usuario:valor-que-no-debe-imprimirse@api.example.test/api' }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(resultado.status, 1); assert.match(resultado.stderr, /No se compiló producción/);
  assert.ok(!resultado.stderr.includes('valor-que-no-debe-imprimirse'));
});

for (const produccion of [false, true]) {
  test(`interceptor Angular real (${produccion ? 'producción' : 'local'}): JWT limitado a origen y ruta autorizados`, async () => {
    // Se compila el interceptor original, sin reescribir su algoritmo ni iniciar navegador.
    // Los paquetes Angular/RxJS quedan externos para compartir sus identidades de inyección.
    const directorioBase = resolve('out-tsc'); await mkdir(directorioBase, { recursive: true });
    const directorio = await mkdtemp(join(directorioBase, 'config-test-'));
    try {
      const api = produccion ? 'https://api.example.test/api' : 'http://127.0.0.1:3000/api';
      const destino = join(directorio, 'interceptor.mjs');
      await build({ stdin: { contents: `export { authInterceptor } from './src/app/auth/auth.interceptor'; export { AuthService } from './src/app/services/auth.service';`,
        resolveDir: process.cwd(), loader: 'ts' }, outfile: destino, bundle: true, format: 'esm', platform: 'browser', packages: 'external', logLevel: 'silent',
        plugins: produccion ? [{ name: 'entorno-produccion', setup(compilador) {
          compilador.onResolve({ filter: /environments\/environment$/ }, () => ({ path: resolve('src/environments/environment.production.ts') }));
        } }] : [], define: { PSIQUE_API_URL: JSON.stringify(api) }, tsconfig: 'tsconfig.json' });
      const { authInterceptor, AuthService } = await import(pathToFileURL(destino).href);
      let actual = true; let expiraciones = 0;
      const auth = { obtenerToken: () => 'token-ficticio', esTokenActual: () => actual, expirarSesion: () => { expiraciones++; } };
      const inyector = createEnvironmentInjector([{ provide: AuthService, useValue: auth }]);
      const anterior = globalThis.window; globalThis.window = { location: { origin: 'https://frontend.example.test' } };
      try {
        for (const [url, esperado] of [[api + '/pacientes', true], [api + '/sesiones/1', true], [api + '/auth/login', false],
          [api + '/auth/registro', false], ['https://otro.example.test/api/pacientes', false],
          [api.replace('/api', '/api-extra') + '/pacientes', false], [api.replace('://', '://usuario:clave@') + '/auth/login', false],
          ['https://api.example.test.ajeno.test/api/pacientes', false], ['/assets/imagen.svg', false]]) {
          let recibido;
          const respuesta = runInInjectionContext(inyector, () => authInterceptor(new HttpRequest('GET', url), req => {
            recibido = req; return of(new HttpResponse({ status: 200, body: {} }));
          }));
          await firstValueFrom(respuesta);
          assert.equal(recibido.headers.get('Authorization'), esperado ? 'Bearer token-ficticio' : null, url);
        }
        const fallida = runInInjectionContext(inyector, () => authInterceptor(new HttpRequest('GET', api + '/pacientes'),
          () => throwError(() => new HttpErrorResponse({ status: 401 }))));
        await assert.rejects(firstValueFrom(fallida)); assert.equal(expiraciones, 1);
        actual = false;
        const tardia = runInInjectionContext(inyector, () => authInterceptor(new HttpRequest('GET', api + '/pacientes'),
          () => of(new HttpResponse({ status: 200 }))));
        await assert.rejects(firstValueFrom(tardia), /no elements/);
      } finally { globalThis.window = anterior; inyector.destroy(); }
    } finally {
      assert.equal(resolve(directorio, '..'), directorioBase);
      await rm(directorio, { recursive: true });
    }
  });
}
