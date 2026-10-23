import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import '@angular/compiler';
import { createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

test('formularios Angular: calendario, borradores y conflictos por duración', async t => {
  const base = resolve('out-tsc'); await mkdir(base, { recursive: true });
  const carpeta = await mkdtemp(join(base, 'horarios-test-'));
  try {
    const destino = join(carpeta, 'pantallas.mjs');
    await build({ stdin: { contents: `
      export { PacienteCrearPage } from './src/app/paciente-crear/paciente-crear.page';
      export { PacienteDetallePage } from './src/app/paciente-detalle/paciente-detalle.page';
      export { SesionDetallePage } from './src/app/sesion-detalle/sesion-detalle.page';
      export { SesionesAgendadasPage } from './src/app/sesiones-agendadas/sesiones-agendadas.page';
      export { SesionesPage } from './src/app/sesiones/sesiones.page';
      export { InicioPage } from './src/app/inicio/inicio.page';
      export { PacienteHistoricoPage } from './src/app/paciente-historico/paciente-historico.page';
      export { AgendaPage } from './src/app/agenda/agenda.page';
      export { AgendarPage } from './src/app/agendar/agendar.page';
      export { NotasPage } from './src/app/notas/notas.page';
      export { CalendarioComponent } from './src/app/shared/calendario.component';
      export { ProximasSesionesPage } from './src/app/proximas-sesiones/proximas-sesiones.page';
      export { PacientesPage } from './src/app/pacientes/pacientes.page';
      export { PacientesService } from './src/app/services/pacientes.service';
      export { SesionesService } from './src/app/services/sesiones.service';
      export { AgendaService } from './src/app/services/agenda.service';
      export { DashboardService } from './src/app/services/dashboard.service';
      export { AuthService } from './src/app/services/auth.service';
      export { NavController } from '@ionic/angular';`, resolveDir: process.cwd(), loader: 'ts' },
      outfile: destino, bundle: true, format: 'esm', platform: 'browser', packages: 'external', logLevel: 'silent', tsconfig: 'tsconfig.json',
      // Solo se sustituye la navegación Ionic, que depende del DOM. Las clases de
      // pantalla, servicios, formularios, validadores y RxJS son los originales.
      plugins: [{ name: 'ionic-sin-dom', setup(b) {
        b.onResolve({ filter: /^@ionic\/angular$/ }, () => ({ path: 'ionic', namespace: 'prueba' }));
        b.onLoad({ filter: /.*/, namespace: 'prueba' }, () => ({ contents: `
          export class IonContent {} export class IonIcon {} export class IonBackButton {} export class IonModal {}
          export class IonRouterLinkWithHref {} export class NavController {}`, loader: 'js' }));
      } }],
    });
    const m = await import(pathToFileURL(destino).href);
    const ficha = { codigo: 'P-001', modalidad: 'Virtual', estado: 'Activo', frecuencia: 'Semanal', proximaSesion: null,
      diaHabitual: null, horarioHabitual: null, fechaCreacion: '2026-10-01', fechaInicioTratamiento: '2026-10-01', motivoConsulta: '', postIt: '' };
    const ruta = () => ({ snapshot: { data: {}, queryParamMap: convertToParamMap({}), paramMap: convertToParamMap({ codigo: 'P-001' }) },
      paramMap: of(convertToParamMap({ codigo: 'P-001' })) });
    function entorno(Clase, route, pacientes = {}, sesiones = {}) {
      const viajes = [];
      const nav = Object.fromEntries(['navigateForward', 'navigateBack', 'navigateRoot'].map(metodo => [metodo, (...args) => {
        viajes.push({ metodo, args }); return Promise.resolve(true);
      }]));
      const inyector = createEnvironmentInjector([
        { provide: ActivatedRoute, useValue: route }, { provide: FormBuilder, useValue: new FormBuilder() },
        { provide: Router, useValue: { navigate: (...args) => { viajes.push({ metodo: 'navigate', args }); return Promise.resolve(true); } } },
        { provide: m.PacientesService, useValue: pacientes }, { provide: m.SesionesService, useValue: { agendadas: () => of([]), ultimas: () => of([]), ...sesiones } },
        { provide: m.AgendaService, useValue: { obtenerSemana: () => of({ dias: [] }) } }, { provide: m.NavController, useValue: nav },
        { provide: m.DashboardService, useValue: { obtenerResumen: () => of({ pacientesActivos: 3, sesionesSemana: 2, pendientesCobro: 1, pendientesAgendar: 1 }) } },
        { provide: m.AuthService, useValue: {} },
      ]);
      t.after(() => inyector.destroy());
      return { pagina: runInInjectionContext(inyector, () => new Clase()), viajes };
    }

    const calendario = { desde: '2099-11-02', hasta: '2099-12-31', ahora: '2099-11-02 08:00', dias: [
      { fecha: '2099-11-02', nombre: 'Lunes', habilitado: true, libres: [{ desde: '08:15', hasta: '17:00' }, { desde: '18:00', hasta: '22:00' }],
        ocupadas: [{ id: 5, codigoPaciente: 'OTRO', horario: '17:00', horarioFin: '18:00', duracionMinutos: 60, estado: 'Programada' }] },
    ] };
    const ultima = { id: 4, codigoPaciente: 'P-001', fecha: '2099-10-26', horario: '16:30', duracionMinutos: 30, modalidad: 'Virtual', estado: 'Realizada', importeCentavos: 0, pagadoCentavos: 0, pendienteCentavos: 0, resumen: '', horarioFin: '17:00' };
    const sesiones = { calendario: () => of(calendario), proximas: () => of([]), pendientesAgendar: () => of([{ paciente: ficha, ultimaSesion: ultima }]) };

    await t.test('Agregar Nota abre la sesión en edición, conserva el borrador ante errores y regresa a Notas al guardar', () => {
      const route = ruta(); route.snapshot.paramMap = convertToParamMap({ id: '4' });
      route.snapshot.queryParamMap = convertToParamMap({ editar: '1', nota: '1' });
      const sesion = { ...ultima, fecha: '2099-11-02', estado: 'Programada' };
      let enviada; let falla = true;
      const { pagina: p, viajes } = entorno(m.SesionDetallePage, route, { obtenerPacientes: () => of([ficha]) }, {
        ...sesiones, obtener: () => of(sesion), agendadas: () => of([{ ...sesion, esProxima: true, postIt: '' }]),
        actualizar: (_id, datos) => { enviada = datos; return falla ? throwError(() => new HttpErrorResponse({ status: 409, error: { mensaje: 'Conflicto' } })) : of({ ...sesion, resumen: datos.resumen }); },
      });
      p.ionViewWillEnter(); assert.equal(p.editando, true); assert.equal(p.puedeEditarNota, true);
      p.formulario.controls.postIt.setValue('x'.repeat(301)); p.formulario.controls.postIt.markAsDirty(); p.guardar(); assert.equal(enviada, undefined);
      p.formulario.controls.postIt.setValue('  Nota desde la sesión  '); p.guardar();
      assert.equal(enviada.postIt, 'Nota desde la sesión'); assert.equal(p.formulario.controls.postIt.value, '  Nota desde la sesión  '); assert.equal(p.editando, true);
      falla = false; p.guardar(); assert.equal(p.notaActual, 'Nota desde la sesión'); assert.equal(viajes.at(-1).args[0], '/notas');
    });

    await t.test('un enlace desactualizado no permite escribir Nota sobre otra próxima sesión', () => {
      const route = ruta(); route.snapshot.paramMap = convertToParamMap({ id: '4' }); route.snapshot.queryParamMap = convertToParamMap({ editar: '1', nota: '1' });
      let enviada = false;
      const { pagina: p } = entorno(m.SesionDetallePage, route, { obtenerPacientes: () => of([ficha]) }, {
        ...sesiones, obtener: () => of({ ...ultima, fecha: '2099-11-02', estado: 'Programada' }), agendadas: () => of([]), actualizar: () => { enviada = true; return of(ultima); },
      });
      p.ionViewWillEnter(); assert.equal(p.puedeEditarNota, false); assert.match(p.errorNota, /ya no es la próxima/); p.guardar(); assert.equal(enviada, false);
    });

    await t.test('Inicio cuenta reservas y notas con texto sin duplicar el segundo bloque, y refresca al volver', () => {
      let reservas = [
        { ...ultima, esProxima: true, postIt: 'Retomar objetivo' },
        { ...ultima, id: 5, esProxima: false, postIt: null },
        { ...ultima, id: 6, codigoPaciente: 'P-002', esProxima: true, postIt: '' },
        { ...ultima, id: 7, codigoPaciente: 'P-003', esProxima: true, postIt: '  \n ' },
      ];
      let consultas = 0; let realizadas = [ultima];
      const { pagina: p } = entorno(m.InicioPage, ruta(), {}, {
        agendadas: () => { consultas++; return of(reservas); }, ultimas: () => of(realizadas),
      });
      let resumen;
      p.ionViewWillEnter(); p.resumen$.subscribe(valor => { resumen = valor; });
      assert.equal(resumen.notas, 1); assert.equal(resumen.sesionesAgendadas, 4); assert.equal(resumen.pacientesActivos, 3);
      assert.equal(resumen.sesionesSemana, 2); assert.equal(resumen.pendientesCobro, 1); assert.equal(resumen.pendientesAgendar, 1);
      assert.equal(resumen.ultimasSesiones, 1, 'El contador corresponde al listado por paciente, no a la semana');
      reservas = [reservas[0], { ...reservas[2], postIt: 'Nota nueva' }];
      realizadas = [ultima, { ...ultima, id: 8, codigoPaciente: 'P-002' }, { ...ultima, id: 9, codigoPaciente: 'P-003' }];
      p.ionViewWillEnter(); p.resumen$.subscribe(valor => { resumen = valor; });
      assert.equal(resumen.notas, 2); assert.equal(resumen.sesionesAgendadas, 2); assert.equal(consultas, 2);
      assert.equal(resumen.ultimasSesiones, 3);
      assert.equal(p.cargando, false); assert.equal(p.errorCarga, false);
    });

    await t.test('Inicio muestra cero sin reservas y permite reintentar un error sin inventar contadores', () => {
      let respuesta = throwError(() => new HttpErrorResponse({ status: 503 }));
      const { pagina: p } = entorno(m.InicioPage, ruta(), {}, { agendadas: () => respuesta });
      let resumen;
      p.ionViewWillEnter(); p.resumen$.subscribe(valor => { resumen = valor; });
      assert.equal(p.errorCarga, true); assert.equal(p.cargando, false); assert.equal(resumen, undefined);
      respuesta = of([]); p.cargarResumen(); p.resumen$.subscribe(valor => { resumen = valor; });
      assert.equal(p.errorCarga, false); assert.equal(resumen.notas, 0); assert.equal(resumen.sesionesAgendadas, 0);
      assert.equal(resumen.ultimasSesiones, 0);
    });

    await t.test('Últimas sesiones pagina de a cinco en orden reciente y conserva la página al refrescar cobros', () => {
      let pagado = 1000000; let consultas = 0; let cantidad = 11;
      const { pagina: p } = entorno(m.SesionesPage, ruta(), {}, { ultimas: () => {
        consultas++;
        return of(Array.from({ length: cantidad }, (_, i) => ({ ...ultima, id: 11 - i,
          codigoPaciente: `P-${11 - i}`, fecha: `2025-01-${String(21 - i).padStart(2, '0')}`,
          importeCentavos: 3000000, pagadoCentavos: pagado, pendienteCentavos: 3000000 - pagado })));
      } });
      p.ionViewWillEnter();
      assert.equal(p.sesiones.length, 11); assert.equal(p.sesiones[0].fecha, '2025-01-21');
      assert.equal(p.paginaActual, 1); assert.equal(p.totalPaginas, 3);
      assert.deepEqual(p.sesionesPagina.map(s => s.id), [11, 10, 9, 8, 7]);
      p.cambiarPagina(2); assert.deepEqual(p.sesionesPagina.map(s => s.id), [6, 5, 4, 3, 2]);
      p.cambiarPagina(3); assert.deepEqual(p.sesionesPagina.map(s => s.id), [1]);
      p.cambiarPagina(0); p.cambiarPagina(4); assert.equal(p.paginaActual, 3);
      p.cambiarPagina(2);
      assert.equal(p.sesiones[0].pendienteCentavos, 2000000);
      assert.equal(p.cargando, false); assert.equal(p.errorCarga, false);
      p.ionViewWillLeave(); assert.deepEqual(p.sesiones, []);
      pagado = 3000000; p.ionViewWillEnter();
      assert.equal(consultas, 2); assert.equal(p.paginaActual, 2); assert.equal(p.sesionesPagina[0].pendienteCentavos, 0);
      cantidad = 5; p.cargar(); assert.equal(p.paginaActual, 1); assert.equal(p.totalPaginas, 1);
      assert.equal(p.sesionesPagina.length, 5, 'Al acortarse el listado no se mantiene una página vacía');
    });

    await t.test('Últimas sesiones diferencia errores de lista vacía y descarta respuestas al salir', () => {
      let respuesta = throwError(() => new HttpErrorResponse({ status: 503 }));
      const { pagina: p } = entorno(m.SesionesPage, ruta(), {}, { ultimas: () => respuesta });
      p.ionViewWillEnter(); assert.equal(p.errorCarga, true); assert.equal(p.cargando, false);
      respuesta = of([]); p.cargar(); assert.equal(p.errorCarga, false); assert.deepEqual(p.sesiones, []);
      const pendiente = new Subject(); respuesta = pendiente; p.cargar();
      assert.equal(p.cargando, true); p.ionViewWillLeave(); pendiente.next([ultima]);
      assert.deepEqual(p.sesiones, []); assert.equal(p.cargando, false);
    });

    await t.test('agendar carga la Nota vigente, solo envía sus cambios y conserva el borrador ante un conflicto', () => {
      const route = ruta(); route.snapshot.queryParamMap = convertToParamMap({ codigoPaciente: 'P-001', fecha: '2099-11-02', horario: '16:30' });
      let enviada; let falla = false;
      const { pagina: p } = entorno(m.AgendarPage, route, { obtenerPacientes: () => of([{ ...ficha, postIt: 'Nota existente' }]) }, {
        ...sesiones, agendar: datos => { enviada = datos; return falla ? throwError(() => new HttpErrorResponse({ status: 409, error: { mensaje: 'Horario ocupado' } })) : of({ id: 1 }); },
      });
      p.ionViewWillEnter(); assert.equal(p.formulario.controls.postIt.value, 'Nota existente');
      p.guardar(); assert.equal(Object.hasOwn(enviada, 'postIt'), false);
      p.formulario.controls.postIt.setValue('  Nota nueva\nSegunda línea  '); p.formulario.controls.postIt.markAsDirty();
      falla = true; p.guardar(); assert.equal(enviada.postIt, 'Nota nueva\nSegunda línea');
      assert.equal(p.formulario.controls.postIt.value, '  Nota nueva\nSegunda línea  '); assert.equal(p.errorGuardado, 'Horario ocupado');
      p.formulario.controls.postIt.setValue('x'.repeat(301)); enviada = undefined; p.guardar(); assert.equal(enviada, undefined);
      p.formulario.controls.postIt.setValue(''); p.guardar(); assert.equal(enviada.postIt, '');
      p.buscarPaciente('OTRO'); assert.equal(p.formulario.controls.postIt.value, ''); assert.equal(p.formulario.controls.postIt.pristine, true);
      p.pacientes.push({ ...ficha, codigo: 'OTRO', postIt: 'De otro paciente' });
      p.elegirPaciente(p.pacientes.at(-1)); assert.equal(p.formulario.controls.postIt.value, 'De otro paciente');
    });

    await t.test('Notas incluye vacías, conserva el texto completo y actualiza la próxima sesión al volver', async () => {
      let texto = 'Una nota extensa. '.repeat(16); let fecha = '2099-11-02';
      const { pagina: p, viajes } = entorno(m.NotasPage, ruta(), {}, { agendadas: () => of([
        { ...ultima, fecha, esProxima: true, postIt: texto },
        { ...ultima, id: 5, esProxima: false, postIt: null },
        { ...ultima, id: 6, codigoPaciente: 'P-002', esProxima: true, postIt: '' },
      ]) });
      p.ionViewWillEnter(); assert.deepEqual(p.notas.map(s => s.id), [4, 6]); assert.equal(p.notas[1].postIt, '');
      p.abrirNota(p.notas[0]); assert.equal(p.notaSeleccionada.postIt, texto);
      let prevenido = false; await p.abrirFicha({ preventDefault: () => { prevenido = true; } });
      assert.equal(prevenido, true); assert.equal(p.notaSeleccionada, undefined); assert.deepEqual(viajes.at(-1).args[0], ['/pacientes', 'P-001']);
      p.ionViewWillLeave(); assert.deepEqual(p.notas, []);
      texto = 'Nota actualizada'; fecha = '2099-11-09'; p.ionViewWillEnter();
      assert.equal(p.notas[0].postIt, texto); assert.equal(p.notas[0].fecha, fecha);
    });

    await t.test('Notas permite reintentar errores y descarta respuestas al salir', () => {
      let respuesta = throwError(() => new Error('Sin conexión'));
      const { pagina: p } = entorno(m.NotasPage, ruta(), {}, { agendadas: () => respuesta });
      p.ionViewWillEnter(); assert.match(p.error, /No se pudieron cargar/); assert.equal(p.cargando, false);
      respuesta = of([]); p.cargar(); assert.deepEqual(p.notas, []); assert.equal(p.error, '');
      respuesta = new Subject(); p.cargar(); p.ionViewWillLeave();
      respuesta.next([{ ...ultima, esProxima: true, postIt: 'Privado' }]); assert.deepEqual(p.notas, []); assert.equal(p.notaSeleccionada, undefined);
    });

    await t.test('agendamiento propone última duración; aumentarla muestra el conflicto sin mover el inicio ni enviar POST', () => {
      const route = ruta(); route.snapshot.queryParamMap = convertToParamMap({ codigoPaciente: 'P-001', fecha: '2099-11-02', horario: '16:30' });
      let llamadas = 0;
      const { pagina: p } = entorno(m.AgendarPage, route, { obtenerPacientes: () => of([ficha]) }, { ...sesiones, agendar: () => { llamadas++; return of({ id: 1 }); } });
      p.ionViewWillEnter();
      assert.equal(p.formulario.controls.duracionMinutos.value, 30); assert.equal(p.errorIntervalo, '');
      p.formulario.controls.duracionMinutos.setValue(40); p.guardar();
      assert.match(p.errorIntervalo, /superpone/); assert.equal(p.formulario.controls.horario.value, '16:30'); assert.equal(llamadas, 0);
      p.formulario.controls.duracionMinutos.setValue(30); p.guardar(); assert.equal(llamadas, 1);
    });

    await t.test('alta con selección fija día, hora y duración y conserva el borrador al volver del calendario', () => {
      const route = ruta(); let enviada;
      const { pagina: p } = entorno(m.PacienteCrearPage, route, { siguienteCodigo: () => of({ codigo: 'P-004' }), crearPaciente: (paciente, turno) => { enviada = { paciente, turno }; return of({ paciente, sesion: null }); } }, sesiones);
      p.ionViewWillEnter(); p.formulario.patchValue({ codigo: 'ALIAS', postIt: 'Borrador conservado' }); p.asignarHorario(); p.ionViewWillLeave();
      route.snapshot.queryParamMap = convertToParamMap({ fecha: '2099-11-02', horario: '16:30', modalidad: 'Virtual', importeCentavos: '0', duracionMinutos: '30' });
      p.ionViewWillEnter();
      assert.equal(p.formulario.controls.codigo.value, 'ALIAS'); assert.equal(p.formulario.controls.postIt.value, 'Borrador conservado');
      assert.equal(p.formulario.controls.diaHabitual.disabled, true); assert.equal(p.formulario.controls.horarioHabitual.disabled, true);
      p.guardar(); assert.equal(enviada.turno.duracionMinutos, 30); assert.equal(enviada.paciente.diaHabitual, 'Lunes');
      assert.equal('fechaInicioTratamiento' in enviada.paciente, false, 'El alta no permite elegir el inicio del tratamiento');
    });

    await t.test('la ficha conserva el borrador ante conflicto y no envía fecha de inicio ni reasigna sesiones', () => {
      const route = ruta(); let enviada;
      const { pagina: p } = entorno(m.PacienteDetallePage, route, { actualizarPaciente: (codigo, paciente, turno) => { enviada = { codigo, paciente, turno }; return throwError(() => new HttpErrorResponse({ status: 409, error: { mensaje: 'Intervalo ocupado' } })); } });
      p.ionViewWillEnter(); p.iniciarEdicion(ficha); p.formulario.controls.postIt.setValue('Conservar'); p.guardar();
      assert.equal(p.editando, true); assert.equal(p.formulario.controls.postIt.value, 'Conservar'); assert.equal(enviada.turno, undefined);
      assert.equal('fechaInicioTratamiento' in enviada.paciente, false);
      assert.equal(p.errorGuardado, 'Intervalo ocupado');
      p.cancelarEdicion(); assert.equal(p.editando, false);
    });

    await t.test('editar una sesión pasada bloquea su paciente y lo incluye al guardar los demás campos', () => {
      for (const estado of ['Programada', 'Realizada']) {
        const sesion = { ...ultima, fecha: '2000-01-03', estado, importeCentavos: 3000000, pendienteCentavos: 3000000 };
        const route = ruta(); route.snapshot.paramMap = convertToParamMap({ id: String(sesion.id) });
        let enviada;
        const { pagina: p } = entorno(m.SesionDetallePage, route, { obtenerPacientes: () => of([ficha]) }, {
          ...sesiones, obtener: () => of(sesion), actualizar: (_id, datos) => { enviada = datos; return of({ ...sesion, ...datos }); },
        });
        p.ionViewWillEnter(); p.iniciarEdicion();
        assert.equal(p.pacienteBloqueado, true);
        assert.equal(p.formulario.controls.codigoPaciente.disabled, true);
        assert.equal(p.formulario.controls.codigoPaciente.value, 'P-001');
        p.formulario.controls.fecha.setValue('2099-11-02');
        assert.equal(p.pacienteBloqueado, true, 'Se usa la fecha original, no el borrador');
        p.formulario.controls.fecha.setValue(sesion.fecha);
        p.formulario.patchValue({ resumen: 'Resumen conservado', pagado: '10.00' });
        p.guardar();
        assert.equal(enviada.codigoPaciente, 'P-001', 'getRawValue conserva el paciente bloqueado');
        assert.equal(enviada.resumen, 'Resumen conservado');
        assert.equal(enviada.pagadoCentavos, 1000);
        assert.equal(p.editando, false);
        p.iniciarEdicion(); p.cancelarEdicion(); p.iniciarEdicion();
        assert.equal(p.formulario.controls.codigoPaciente.disabled, true);
        p.sesion = { ...sesion, fecha: '2099-11-02', estado: 'Programada' }; p.iniciarEdicion();
        assert.equal(p.pacienteBloqueado, false);
        assert.equal(p.formulario.controls.codigoPaciente.enabled, true, 'Una sesión futura vuelve a permitir elegir paciente');
      }
    });

    await t.test('sesiones agendadas comparte listado general y filtro, y refresca las notas al volver', () => {
      const route = ruta(); const filtros = new BehaviorSubject(convertToParamMap({ codigoPaciente: 'P-001' }));
      route.queryParamMap = filtros;
      const consultas = []; let nota = 'Nota vigente';
      const { pagina: p } = entorno(m.SesionesAgendadasPage, route, {}, {
        agendadas: codigo => { consultas.push(codigo); return of([{ ...ultima, estado: 'Programada', esProxima: true, postIt: nota }]); },
      });
      p.ionViewWillEnter();
      assert.equal(p.codigoPaciente, 'P-001'); assert.equal(p.destinoVolver, '/pacientes/P-001');
      assert.equal(p.sesiones[0].postIt, 'Nota vigente'); assert.equal(p.cargando, false);
      filtros.next(convertToParamMap({}));
      assert.equal(p.codigoPaciente, ''); assert.equal(p.destinoVolver, '/inicio');
      assert.deepEqual(consultas, ['P-001', undefined]);
      p.ionViewWillLeave(); assert.deepEqual(p.sesiones, []);
      filtros.next(convertToParamMap({ codigoPaciente: 'P-002' })); assert.equal(consultas.length, 2);
      nota = 'Nota modificada'; p.ionViewWillEnter();
      assert.equal(consultas.at(-1), 'P-002'); assert.equal(p.sesiones[0].postIt, 'Nota modificada');
    });

    await t.test('agendadas permite reintentar y retira notas y respuestas tardías al salir', () => {
      const route = ruta(); route.queryParamMap = of(convertToParamMap({}));
      let respuesta = throwError(() => new Error('Sin conexión'));
      const { pagina: p } = entorno(m.SesionesAgendadasPage, route, {}, { agendadas: () => respuesta });
      p.ionViewWillEnter(); assert.match(p.error, /No se pudieron cargar/); assert.equal(p.cargando, false);
      respuesta = new Subject(); p.cargar(); assert.equal(p.error, ''); assert.equal(p.cargando, true);
      p.ionViewWillLeave(); respuesta.next([{ ...ultima, postIt: 'No debe mostrarse' }]);
      assert.deepEqual(p.sesiones, []); assert.equal(p.cargando, false);
      respuesta = of([]); p.ionViewWillEnter(); assert.deepEqual(p.sesiones, []); assert.equal(p.error, '');
    });

    await t.test('histórico del paciente pagina cinco realizadas, conserva la página al volver y reinicia al cambiar de ficha', () => {
      const route = ruta(); const parametros = new BehaviorSubject(convertToParamMap({ codigo: 'P-001' }));
      route.paramMap = parametros;
      const consultas = []; let resumen = 'Resumen anterior'; let cantidad = 10;
      const { pagina: p } = entorno(m.PacienteHistoricoPage, route, {}, {
        historialPaciente: codigo => {
          consultas.push(codigo);
          return of(Array.from({ length: cantidad }, (_, i) => ({ ...ultima, id: 10 - i,
            codigoPaciente: codigo, fecha: `2001-02-${String(20 - i).padStart(2, '0')}`, resumen })));
        },
      });
      p.ionViewWillEnter(); assert.equal(p.destinoVolver, '/pacientes/P-001');
      assert.equal(p.sesiones.length, 10); assert.equal(p.totalPaginas, 2);
      assert.deepEqual(p.sesionesPagina.map(s => s.id), [10, 9, 8, 7, 6]);
      p.cambiarPagina(2); assert.deepEqual(p.sesionesPagina.map(s => s.id), [5, 4, 3, 2, 1]);
      p.cambiarPagina(3); assert.equal(p.paginaActual, 2, 'Diez sesiones tienen exactamente dos páginas');
      p.ionViewWillLeave(); assert.deepEqual(p.sesiones, []);
      resumen = 'Resumen corregido'; p.ionViewWillEnter();
      assert.equal(p.paginaActual, 2); assert.equal(p.sesionesPagina[0].resumen, resumen); assert.equal(p.cargando, false);
      parametros.next(convertToParamMap({ codigo: 'P-002' }));
      assert.deepEqual(consultas, ['P-001', 'P-001', 'P-002']);
      assert.equal(p.paginaActual, 1); assert.ok(p.sesionesPagina.every(s => s.codigoPaciente === 'P-002'));
      p.cambiarPagina(2); cantidad = 0; p.cargar();
      assert.equal(p.paginaActual, 1); assert.deepEqual(p.sesionesPagina, []);
    });

    await t.test('histórico informa errores, admite un listado vacío y descarta respuestas tardías', () => {
      const route = ruta(); route.paramMap = of(convertToParamMap({ codigo: 'P-001' }));
      let respuesta = throwError(() => new HttpErrorResponse({ status: 404 }));
      const { pagina: p } = entorno(m.PacienteHistoricoPage, route, {}, { historialPaciente: () => respuesta });
      p.ionViewWillEnter(); assert.equal(p.error, 'Paciente no encontrado.'); assert.equal(p.cargando, false);
      respuesta = throwError(() => new HttpErrorResponse({ status: 503 })); p.cargar(); assert.match(p.error, /No se pudo cargar/);
      respuesta = of([]); p.cargar(); assert.equal(p.error, ''); assert.deepEqual(p.sesiones, []);
      respuesta = new Subject(); p.cargar(); p.ionViewWillLeave(); respuesta.next([ultima]);
      assert.deepEqual(p.sesiones, []); assert.equal(p.cargando, false);
    });

    await t.test('seleccionar un intervalo desde el calendario devuelve al formulario sin reservar', () => {
      const route = ruta(); route.snapshot.paramMap = convertToParamMap({ origen: 'paciente' }); route.snapshot.queryParamMap = convertToParamMap({ codigo: 'P-001', fecha: '2099-11-02', horario: '16:30', duracionMinutos: '30' });
      const { pagina: p, viajes } = entorno(m.AgendarPage, route, { obtenerPacientes: () => of([ficha]) }, sesiones);
      p.ionViewWillEnter(); p.guardar(); assert.equal(viajes.at(-1).metodo, 'navigateBack');
      assert.deepEqual(viajes.at(-1).args[0], ['/pacientes', 'P-001']); assert.equal(viajes.at(-1).args[1].queryParams.duracionMinutos, 30);
    });

    await t.test('la baja es explícita y solo actualiza la ficha cuando el backend la confirma', () => {
      const route = ruta(); let codigo;
      const { pagina: p } = entorno(m.PacienteDetallePage, route, { darDeBaja: c => { codigo = c; return of({ ...ficha, estado: 'De baja' }); } });
      p.confirmandoBaja = true; p.darDeBaja(); assert.equal(codigo, 'P-001'); assert.equal(p.confirmandoBaja, false); assert.match(p.mensajeGuardado, /liberadas/);
    });

    await t.test('el buscador filtra códigos sin distinguir mayúsculas y escribir invalida la selección anterior', () => {
      const { pagina: p } = entorno(m.AgendarPage, ruta(), {}, sesiones);
      p.pacientes = [ficha, { ...ficha, codigo: 'OTRO' }, { ...ficha, codigo: 'P-012' }];
      p.formulario.controls.codigoPaciente.setValue('OTRO'); p.buscarPaciente('p-0');
      assert.deepEqual(p.coincidencias.map(i => i.codigo), ['P-001', 'P-012']); assert.equal(p.formulario.controls.codigoPaciente.value, '');
      p.elegirPaciente(ficha); assert.equal(p.formulario.controls.codigoPaciente.value, 'P-001'); assert.equal(p.resultadosAbiertos, false);
    });

    await t.test('un paciente elegido en pendientes queda fijo y conserva su identidad al reservar', () => {
      const route = ruta(); route.snapshot.queryParamMap = convertToParamMap({ codigoPaciente: 'P-001', pacienteFijo: '1', fecha: '2099-11-02', horario: '16:30' });
      let enviada;
      const { pagina: p } = entorno(m.AgendarPage, route, { obtenerPacientes: () => of([ficha]) }, { ...sesiones, agendar: datos => { enviada = datos; return of({ id: 1 }); } });
      p.ionViewWillEnter(); p.buscarPaciente('OTRO'); p.elegirPaciente({ ...ficha, codigo: 'OTRO' }); p.guardar();
      assert.equal(p.pacienteFijo, true); assert.equal(enviada.codigoPaciente, 'P-001');
    });

    await t.test('semana actual por defecto y navegación lunes a domingo a través del cambio de mes', () => {
      const { pagina: p } = entorno(m.CalendarioComponent, ruta()); p.calendario = calendario;
      assert.equal(p.lunes, '2099-11-02'); assert.equal(p.domingo, '2099-11-08');
      p.fechaVisible = '2099-12-01'; assert.equal(p.lunes, '2099-11-30'); assert.equal(p.domingo, '2099-12-06');
      let fecha; p.cambiarSemana.subscribe(f => { fecha = f; }); p.moverSemana(-7); assert.equal(fecha, '2099-11-23');
    });

    await t.test('cada día intercala disponibilidad y sesiones por hora, incluidos los huecos intermedios', () => {
      const { pagina: p } = entorno(m.CalendarioComponent, ruta());
      const dia = { fecha: '2099-11-03', nombre: 'Martes', habilitado: true,
        libres: [{ desde: '12:00', hasta: '22:00' }, { desde: '08:00', hasta: '10:00' }, { desde: '11:00', hasta: '11:30' }],
        ocupadas: [{ id: 2, horario: '11:30', horarioFin: '12:00' }, { id: 1, horario: '10:00', horarioFin: '11:00' }] };
      assert.deepEqual(p.bloquesDelDia(dia).map(b => [b.tipo, b.inicio]), [
        ['libre', '08:00'], ['sesion', '10:00'], ['libre', '11:00'], ['sesion', '11:30'], ['libre', '12:00'],
      ]);
      assert.deepEqual(p.bloquesDelDia({ ...dia, habilitado: false }).map(b => b.tipo), ['sesion', 'sesion']);
    });

    await t.test('Nota consulta solo el Post-it vigente de la próxima sesión y lo retira al cerrar', () => {
      let consultas = 0;
      const { pagina: p } = entorno(m.CalendarioComponent, ruta(), { obtenerPacientePorCodigo: () => { consultas++; return of({ ...ficha, postIt: 'Retomar objetivo' }); } });
      const dia = calendario.dias[0], s = dia.ocupadas[0];
      p.abrirNota(dia, { ...s, esProxima: false }); assert.equal(consultas, 0);
      p.abrirNota(dia, { ...s, esProxima: true }); assert.equal(p.nota, 'Retomar objetivo'); assert.equal(consultas, 1);
      p.alCerrarNota(); assert.equal(p.nota, ''); assert.equal(p.notaSesion, undefined);
    });

    await t.test('suspender quita el pendiente únicamente al confirmar el guardado y los listados separan estados', () => {
      const pendientes = [{ paciente: ficha, ultimaSesion: ultima }];
      const { pagina: p } = entorno(m.ProximasSesionesPage, ruta(), { suspender: () => throwError(() => new Error('Sin conexión')) }, { pendientesAgendar: () => of(pendientes) });
      p.ionViewWillEnter(); p.confirmarSuspension = ficha.codigo; p.suspender(ficha.codigo);
      assert.equal(p.pendientes.length, 1); assert.match(p.errorEstado, /Continúa pendiente/);
      const { pagina: correcto } = entorno(m.ProximasSesionesPage, ruta(), { suspender: () => of({ ...ficha, estado: 'Suspendido' }) }, { pendientesAgendar: () => of(pendientes) });
      correcto.ionViewWillEnter(); correcto.confirmarSuspension = ficha.codigo; correcto.suspender(ficha.codigo); assert.equal(correcto.pendientes.length, 0);
      const route = ruta();
      const { pagina: listado } = entorno(m.PacientesPage, route, { obtenerPacientes: () => of([ficha, { ...ficha, codigo: 'S', estado: 'Suspendido' }, { ...ficha, codigo: 'B', estado: 'De baja' }]) });
      listado.ionViewWillEnter(); let activos; listado.pacientes$.subscribe(p => { activos = p; }); assert.deepEqual(activos.map(p => p.codigo), ['P-001']);
      route.snapshot.data = { noActivos: true }; listado.ionViewWillEnter(); let inactivos; listado.pacientes$.subscribe(p => { inactivos = p; }); assert.deepEqual(inactivos.map(p => p.codigo), ['S', 'B']);
    });
  } finally { assert.equal(resolve(carpeta, '..'), base); await rm(carpeta, { recursive: true }); }
});
