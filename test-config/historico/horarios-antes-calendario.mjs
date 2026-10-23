import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

test('formularios Angular: horarios elegidos, borradores y validación de minutos', async t => {
  const base = resolve('out-tsc'); await mkdir(base, { recursive: true });
  const carpeta = await mkdtemp(join(base, 'horarios-test-'));
  try {
    const destino = join(carpeta, 'pantallas.mjs');
    await build({ stdin: { contents: `
      export { PacienteCrearPage } from './src/app/paciente-crear/paciente-crear.page';
      export { PacienteDetallePage } from './src/app/paciente-detalle/paciente-detalle.page';
      export { AgendaPage } from './src/app/agenda/agenda.page';
      export { AgendarPage } from './src/app/agendar/agendar.page';
      export { HorariosDisponiblesPage } from './src/app/horarios-disponibles/horarios-disponibles.page';
      export { PacientesService } from './src/app/services/pacientes.service';
      export { SesionesService } from './src/app/services/sesiones.service';
      export { AgendaService } from './src/app/services/agenda.service';
      export { NavController } from '@ionic/angular';`, resolveDir: process.cwd(), loader: 'ts' },
      outfile: destino, bundle: true, format: 'esm', platform: 'browser', packages: 'external', logLevel: 'silent', tsconfig: 'tsconfig.json',
      // Solo se sustituye la navegación Ionic, que depende del DOM. Las clases de
      // pantalla, servicios, formularios, validadores y RxJS son los originales.
      plugins: [{ name: 'ionic-sin-dom', setup(b) {
        b.onResolve({ filter: /^@ionic\/angular$/ }, () => ({ path: 'ionic', namespace: 'prueba' }));
        b.onLoad({ filter: /.*/, namespace: 'prueba' }, () => ({ contents: `
          export class IonContent {} export class IonIcon {} export class IonBackButton {}
          export class IonRouterLinkWithHref {} export class NavController {}`, loader: 'js' }));
      } }],
    });
    const m = await import(pathToFileURL(destino).href);
    const ficha = { codigo: 'P-001', modalidad: 'Virtual', estado: 'Activo', frecuencia: 'Semanal', proximaSesion: null,
      diaHabitual: null, horarioHabitual: null, fechaCreacion: '2026-10-01', fechaInicioTratamiento: '2026-10-01', motivoConsulta: '', postIt: '' };
    const ruta = () => ({ snapshot: { queryParamMap: convertToParamMap({}), paramMap: convertToParamMap({ codigo: 'P-001' }) },
      paramMap: of(convertToParamMap({ codigo: 'P-001' })) });
    function entorno(Clase, route, pacientes = {}, sesiones = {}) {
      const viajes = [];
      const nav = Object.fromEntries(['navigateForward', 'navigateBack', 'navigateRoot'].map(metodo => [metodo, (...args) => {
        viajes.push({ metodo, args }); return Promise.resolve(true);
      }]));
      const inyector = createEnvironmentInjector([
        { provide: ActivatedRoute, useValue: route }, { provide: FormBuilder, useValue: new FormBuilder() },
        { provide: m.PacientesService, useValue: pacientes }, { provide: m.SesionesService, useValue: sesiones },
        { provide: m.AgendaService, useValue: { obtenerSemana: () => of({ dias: [] }) } }, { provide: m.NavController, useValue: nav },
      ]);
      t.after(() => inyector.destroy());
      return { pagina: runInInjectionContext(inyector, () => new Clase()), viajes };
    }

    await t.test('crear desde un horario fija día y hora, conserva el borrador al elegir otro y los envía deshabilitados', () => {
      const route = ruta(); let enviada;
      const { pagina: p } = entorno(m.PacienteCrearPage, route, {
        siguienteCodigo: () => of({ codigo: 'P-004' }), crearPaciente: (paciente, turno) => { enviada = { paciente, turno }; return of({ paciente, sesion: null }); },
      }, { horario: () => of({ estado: 'Disponible' }) });
      p.ionViewWillEnter();
      assert.equal(p.formulario.controls.diaHabitual.disabled, true);
      assert.equal(p.formulario.controls.horarioHabitual.disabled, true);
      p.formulario.patchValue({ codigo: 'ALIAS', postIt: 'Borrador sin guardar', modalidad: 'Virtual' });
      p.asignarHorario(); p.ionViewWillLeave();
      route.snapshot.queryParamMap = convertToParamMap({ fecha: '2099-11-02', horario: '18:15', modalidad: 'Virtual', importeCentavos: '0' });
      p.ionViewWillEnter();
      assert.equal(p.formulario.controls.codigo.value, 'ALIAS');
      assert.equal(p.formulario.controls.postIt.value, 'Borrador sin guardar');
      assert.equal(p.formulario.controls.diaHabitual.value, 'Lunes');
      assert.equal(p.formulario.controls.horarioHabitual.value, '18:15');
      assert.equal(p.formulario.value.horarioHabitual, undefined);
      p.guardar();
      assert.equal(enviada.paciente.horarioHabitual, '18:15');
      assert.equal(enviada.paciente.diaHabitual, 'Lunes');
      assert.equal(enviada.turno.fecha, '2099-11-02');
      p.formulario.controls.modalidad.setValue('Presencial');
      p.asignarHorario(); p.ionViewWillLeave(); p.ionViewWillEnter();
      assert.equal(p.formulario.controls.modalidad.value, 'Presencial', 'Cancelar el selector conserva la modalidad del borrador');
    });

    await t.test('cancelar el selector conserva la ficha y una entrada independiente no reutiliza el alta anterior', () => {
      const route = ruta();
      const { pagina: p, viajes } = entorno(m.PacienteCrearPage, route, { siguienteCodigo: () => of({ codigo: 'P-004' }) });
      p.ionViewWillEnter(); p.formulario.controls.postIt.setValue('Conservar');
      p.asignarHorario(); p.ionViewWillLeave(); p.ionViewWillEnter();
      assert.equal(p.formulario.controls.postIt.value, 'Conservar'); assert.equal(p.turno, null);
      p.cancelar(); assert.equal(viajes.at(-1).args[0], '/pacientes');
      p.ionViewWillLeave(); p.ionViewWillEnter();
      assert.equal(p.formulario.controls.postIt.value, '');
      assert.equal(p.formulario.controls.horarioHabitual.disabled, true);
    });

    await t.test('editar vuelve al mismo borrador, envía la selección y conserva cambios ante conflicto', () => {
      const route = ruta(); let enviada; let conflicto = true;
      const { pagina: p } = entorno(m.PacienteDetallePage, route, { actualizarPaciente: (codigo, paciente, turno) => {
        enviada = { codigo, paciente, turno };
        return conflicto ? throwError(() => new HttpErrorResponse({ status: 409, error: { mensaje: 'Horario ocupado' } })) : of(paciente);
      } });
      p.ionViewWillEnter(); p.iniciarEdicion(ficha);
      p.formulario.patchValue({ codigo: 'CAMBIO', postIt: 'Conservar borrador' });
      p.asignarHorario(); p.ionViewWillLeave();
      route.snapshot.queryParamMap = convertToParamMap({ fecha: '2099-11-02', horario: '19:30' }); p.ionViewWillEnter();
      assert.equal(p.editando, true); assert.equal(p.formulario.controls.postIt.value, 'Conservar borrador');
      p.guardar();
      assert.equal(p.editando, true); assert.equal(p.errorGuardado, 'Horario ocupado');
      assert.equal(enviada.codigo, 'P-001'); assert.equal(enviada.paciente.codigo, 'CAMBIO');
      assert.deepEqual(enviada.turno, { fecha: '2099-11-02', horario: '19:30' });
      assert.equal(enviada.paciente.fechaCreacion, ficha.fechaCreacion);
      assert.equal(enviada.paciente.diaHabitual, 'Lunes');
      conflicto = false; p.guardar(); assert.equal(p.editando, false);
      p.iniciarEdicion(ficha); p.asignarHorario(); p.ionViewWillLeave(); p.ionViewWillEnter();
      assert.equal(p.turnoElegido, null, 'Cancelar no reaplica la selección anterior de la URL');
    });

    await t.test('Agenda no envía minutos inválidos y permite escribir una hora válida de un dígito', () => {
      let enviada; const { pagina: p } = entorno(m.AgendaPage, ruta(), {}, { crearHorario: (fecha, horario) => { enviada = { fecha, horario }; return of({}); } });
      p.formulario.patchValue({ fecha: '2099-11-02', hora: '7', minuto: '17' }); p.crearHorario();
      assert.equal(enviada, undefined); assert.equal(p.formulario.invalid, true);
      p.formulario.controls.minuto.setValue('15'); p.crearHorario();
      assert.deepEqual(enviada, { fecha: '2099-11-02', horario: '07:15' });
    });

    await t.test('Agendar sesión ofrece únicamente pacientes activos', () => {
      const route = ruta(); route.snapshot.queryParamMap = convertToParamMap({ fecha: '2099-11-02', horario: '18:00' });
      const { pagina: p } = entorno(m.AgendarPage, route, { obtenerPacientes: () => of([
        ficha, { ...ficha, codigo: 'PAUSA', estado: 'En pausa' }, { ...ficha, codigo: 'MIXTO', estado: 'aCtIvO' },
      ]) }, { horario: () => of({ estado: 'Disponible' }) });
      p.ionViewWillEnter(); assert.deepEqual(p.pacientes.map(p => p.codigo), ['P-001', 'MIXTO']);
    });

    await t.test('la lista devuelve la selección al formulario sin reservar ni modificar registros', () => {
      const route = ruta(); route.snapshot.paramMap = convertToParamMap({ origen: 'paciente' });
      route.snapshot.queryParamMap = convertToParamMap({ codigo: 'P-001' });
      const turno = { fecha: '2099-11-02', horario: '18:00', estado: 'Disponible' };
      const { pagina: p, viajes } = entorno(m.HorariosDisponiblesPage, route, {}, { disponiblesTodos: () => of([turno]) });
      p.ionViewWillEnter(); p.seleccionar(p.horarios[0]);
      assert.equal(viajes.at(-1).metodo, 'navigateBack');
      assert.deepEqual(viajes.at(-1).args, [['/pacientes', 'P-001'], { queryParams: { fecha: turno.fecha, horario: turno.horario } }]);
    });
  } finally { assert.equal(resolve(carpeta, '..'), base); await rm(carpeta, { recursive: true }); }
});
