import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonContent, NavController } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, forkJoin, of, Subscription, switchMap } from 'rxjs';
import { Paciente } from '../models/paciente';
import { CalendarioAgenda, Sesion } from '../models/sesion';
import { PacientesService } from '../services/pacientes.service';
import { SesionesService } from '../services/sesiones.service';
import { aCentavos, aPesos, importeValido } from '../shared/importes';
import { CalendarioComponent } from '../shared/calendario.component';

const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
const horaTexto = (valor: number) => `${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`;

@Component({
  selector: 'app-agendar', standalone: true,
  imports: [DatePipe, ReactiveFormsModule, IonContent, CalendarioComponent],
  templateUrl: './agendar.page.html', styleUrl: './agendar.page.scss',
})
export class AgendarPage {
  private readonly route = inject(ActivatedRoute);
  private readonly navegacion = inject(NavController);
  private readonly pacientesService = inject(PacientesService);
  private readonly sesionesService = inject(SesionesService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  private consultaPaciente?: Subscription;
  private cargaSemana?: Subscription;
  readonly iconoVolver = arrowBackOutline;
  readonly formulario = inject(FormBuilder).nonNullable.group({
    codigoPaciente: ['', Validators.required], fecha: ['', Validators.required], horario: ['', Validators.required],
    duracionMinutos: [0, [Validators.required, Validators.pattern(/^(30|40|50|60)$/)]],
    modalidad: ['Presencial' as Paciente['modalidad'], Validators.required], importe: ['0.00', importeValido],
    postIt: ['', Validators.maxLength(300)],
  });
  pacientes: Paciente[] = [];
  pendientes: { paciente: Paciente; ultimaSesion: Sesion | null }[] = [];
  proximas: Sesion[] = [];
  calendario?: CalendarioAgenda;
  calendarioVisible?: CalendarioAgenda;
  semanaVisible = '';
  cargandoSemana = false;
  errorSemana = '';
  private excluirSesion?: number;
  pacienteFijo = false;
  busquedaPaciente = '';
  resultadosAbiertos = false;
  opcionActiva = 0;
  get coincidencias(): Paciente[] { return this.pacientes.filter(p => p.codigo.toLowerCase().includes(this.busquedaPaciente.trim().toLowerCase())); }
  cargando = true;
  cargandoPaciente = false;
  guardando = false;
  errorCarga = '';
  errorGuardado = '';
  modo = '';
  codigoOriginal = '';
  get esSelector(): boolean { return ['crear', 'paciente', 'sesion'].includes(this.modo); }
  get dia() { return this.calendario?.dias.find(d => d.fecha === this.formulario.controls.fecha.value); }
  get horarioFin(): string { return horaTexto(minutos(this.formulario.controls.horario.value) + Number(this.formulario.controls.duracionMinutos.value)); }
  get opcionesInicio(): string[] {
    return (this.dia?.libres ?? []).flatMap(f => {
      const horas: string[] = [];
      for (let m = minutos(f.desde); m + 30 <= minutos(f.hasta); m += 15) horas.push(horaTexto(m));
      return horas;
    });
  }
  get errorIntervalo(): string {
    const { fecha, horario, duracionMinutos } = this.formulario.getRawValue();
    if (!fecha || !horario || !duracionMinutos || !this.calendario) return '';
    if (!this.dia?.habilitado || fecha < this.calendario.desde || fecha > this.calendario.hasta) return 'Elegí una fecha habilitada entre hoy y el último día del mes siguiente.';
    if (Number(duracionMinutos) + minutos(horario) > 1320) return 'La sesión debe terminar como máximo a las 22:00.';
    if (!this.dia.libres.some(f => horario >= f.desde && minutos(horario) + Number(duracionMinutos) <= minutos(f.hasta))) {
      return 'La duración elegida no entra en la franja libre: se superpone con otra sesión o incluye un horario ya transcurrido. Elegí otro inicio o reducí la duración.';
    }
    return '';
  }

  ionViewWillEnter(): void { this.cargar(); }
  ionViewWillLeave(): void { this.carga?.unsubscribe(); this.consultaPaciente?.unsubscribe(); this.cargaSemana?.unsubscribe(); }

  cargar(): void {
    this.carga?.unsubscribe();
    this.consultaPaciente?.unsubscribe();
    this.cargaSemana?.unsubscribe();
    this.modo = this.route.snapshot.paramMap.get('origen') ?? '';
    const q = this.route.snapshot.queryParamMap;
    this.codigoOriginal = q.get('codigo') ?? q.get('codigoPaciente') ?? '';
    this.pacienteFijo = !this.esSelector && q.get('pacienteFijo') === '1' && !!this.codigoOriginal;
    this.busquedaPaciente = this.codigoOriginal; this.resultadosAbiertos = false;
    const importe = Number(q.get('importeCentavos') ?? 0);
    this.formulario.reset({ codigoPaciente: this.codigoOriginal, fecha: q.get('fecha') ?? '', horario: q.get('horario') ?? '',
      duracionMinutos: Number(q.get('duracionMinutos') ?? 0), modalidad: q.get('modalidad') === 'Virtual' ? 'Virtual' : 'Presencial',
      importe: Number.isSafeInteger(importe) && importe >= 0 && importe <= 999999999 ? aPesos(importe) : '0.00' });
    this.cargando = true; this.errorCarga = ''; this.errorGuardado = ''; this.calendario = undefined;
    const proximas = this.codigoOriginal ? this.sesionesService.proximas(this.codigoOriginal) : of([] as Sesion[]);
    this.carga = proximas.pipe(switchMap(proximas => {
      this.proximas = proximas;
      const excluir = this.modo === 'paciente' ? proximas[0]?.id : Number(q.get('sesionId')) || undefined;
      this.excluirSesion = excluir;
      return forkJoin({ calendario: this.sesionesService.calendario(excluir), pacientes: this.pacientesService.obtenerPacientes(), pendientes: this.sesionesService.pendientesAgendar() });
    }), takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; })).subscribe({
      next: ({ calendario, pacientes, pendientes }) => {
        this.calendario = calendario;
        this.pacientes = pacientes.filter(p => p.estado.toLowerCase() === 'activo');
        this.formulario.controls.postIt.setValue(this.pacientes.find(p => p.codigo === this.codigoOriginal)?.postIt ?? '');
        this.formulario.controls.postIt.markAsPristine();
        if (this.pacienteFijo && !this.pacientes.some(p => p.codigo === this.codigoOriginal)) { this.errorCarga = 'El paciente seleccionado ya no está activo. Volvé a pendientes para actualizar el listado.'; return; }
        this.pendientes = pendientes;
        const ultima = pendientes.find(p => p.paciente.codigo === this.codigoOriginal)?.ultimaSesion ?? this.proximas.at(-1);
        if (!q.has('duracionMinutos') && ultima) this.formulario.controls.duracionMinutos.setValue(ultima.duracionMinutos);
        if (this.modo === 'crear') this.formulario.controls.codigoPaciente.clearValidators();
        else this.formulario.controls.codigoPaciente.setValidators(Validators.required);
        this.formulario.controls.codigoPaciente.updateValueAndValidity();
        if (!this.formulario.controls.fecha.value) this.formulario.controls.fecha.setValue(calendario.desde);
        if (!this.formulario.controls.horario.value && this.opcionesInicio.length) this.formulario.controls.horario.setValue(this.opcionesInicio[0]);
        this.calendarioVisible = calendario;
        this.mostrarSemana(this.formulario.controls.fecha.value);
      },
      error: (error: HttpErrorResponse) => { this.errorCarga = error.error?.mensaje ?? 'No se pudo cargar el calendario. Volvé a intentar.'; },
    });
  }

  mostrarSemana(fecha: string): void {
    this.cargaSemana?.unsubscribe(); this.semanaVisible = fecha; this.cargandoSemana = true; this.errorSemana = '';
    // Se conserva la ventana de validación del formulario mientras se consulta
    // otra semana. Navegar no descarta ni cambia la reserva que se está preparando.
    this.cargaSemana = this.sesionesService.calendario(this.excluirSesion, fecha).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.cargandoSemana = false; })).subscribe({
      next: calendario => { this.calendarioVisible = calendario; }, error: () => { this.errorSemana = 'No se pudo consultar esta semana.'; },
    });
  }

  buscarPaciente(texto: string): void {
    if (this.pacienteFijo) return;
    this.consultaPaciente?.unsubscribe(); this.cargandoPaciente = false;
    this.busquedaPaciente = texto; this.resultadosAbiertos = true; this.opcionActiva = 0;
    this.formulario.controls.codigoPaciente.setValue(''); this.proximas = [];
    this.formulario.controls.postIt.reset('');
  }

  elegirPaciente(paciente: Paciente): void {
    if (this.pacienteFijo && paciente.codigo !== this.codigoOriginal) return;
    this.busquedaPaciente = paciente.codigo; this.resultadosAbiertos = false;
    this.formulario.controls.codigoPaciente.setValue(paciente.codigo); this.seleccionarPaciente();
  }

  teclaPaciente(evento: KeyboardEvent): void {
    if (this.pacienteFijo) return;
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault(); this.resultadosAbiertos = true;
      this.opcionActiva = Math.max(0, Math.min(this.coincidencias.length - 1, this.opcionActiva + (evento.key === 'ArrowDown' ? 1 : -1)));
    } else if (evento.key === 'Enter') {
      evento.preventDefault(); const paciente = this.coincidencias[this.opcionActiva]; if (paciente) this.elegirPaciente(paciente);
    } else if (evento.key === 'Escape') { this.resultadosAbiertos = false; }
  }

  elegirDia(fecha: string): void {
    this.formulario.controls.fecha.setValue(fecha);
    this.formulario.controls.horario.setValue(this.opcionesInicio[0] ?? '');
    this.errorGuardado = '';
    document.getElementById('datos-reserva')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  seleccionarPaciente(): void {
    const codigo = this.formulario.controls.codigoPaciente.value;
    const paciente = this.pacientes.find(p => p.codigo === codigo);
    if (paciente) this.formulario.controls.modalidad.setValue(paciente.modalidad);
    this.formulario.controls.postIt.reset(paciente?.postIt ?? '');
    this.consultaPaciente?.unsubscribe();
    this.cargandoPaciente = true;
    this.errorGuardado = '';
    this.consultaPaciente = this.sesionesService.proximas(codigo).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.cargandoPaciente = false; })).subscribe({
      next: proximas => {
        this.proximas = proximas;
        const ultima = proximas.at(-1) ?? this.pendientes.find(p => p.paciente.codigo === codigo)?.ultimaSesion;
        this.formulario.controls.duracionMinutos.setValue(ultima?.duracionMinutos ?? 0);
      }, error: () => { this.errorGuardado = 'No se pudo consultar la próxima sesión del paciente. Volvé a seleccionarlo.'; },
    });
  }

  guardar(): void {
    if (this.guardando || this.cargandoPaciente || this.errorCarga) return;
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid || this.errorIntervalo) return;
    const v = this.formulario.getRawValue();
    if (!this.esSelector && (!this.pacientes.some(p => p.codigo === v.codigoPaciente) || (this.pacienteFijo && v.codigoPaciente !== this.codigoOriginal))) return;
    const importeCentavos = aCentavos(v.importe);
    if (importeCentavos === null) return;
    if (this.esSelector) {
      const destino = this.modo === 'crear' ? '/pacientes/nuevo' : this.modo === 'sesion' ? ['/sesiones', this.route.snapshot.queryParamMap.get('sesionId')!] : ['/pacientes', this.codigoOriginal];
      void this.navegacion.navigateBack(destino, { queryParams: { fecha: v.fecha, horario: v.horario,
        duracionMinutos: Number(v.duracionMinutos), modalidad: v.modalidad, importeCentavos } });
      return;
    }
    this.guardando = true; this.errorGuardado = '';
    this.sesionesService.agendar({ fecha: v.fecha, horario: v.horario, duracionMinutos: Number(v.duracionMinutos),
      codigoPaciente: v.codigoPaciente, modalidad: v.modalidad, importeCentavos,
      ...(this.formulario.controls.postIt.dirty ? { postIt: v.postIt.trim() } : {}) }).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.guardando = false; })).subscribe({
      next: sesion => { void this.navegacion.navigateRoot(['/sesiones', sesion.id], { replaceUrl: true, queryParams: { agendada: '1' } }); },
      error: (error: HttpErrorResponse) => { this.errorGuardado = error.error?.mensaje ?? 'No se pudo reservar. Revisá el calendario y volvé a intentar.'; },
    });
  }

  volver(): void { if (this.esSelector) this.navegacion.back(); else void this.navegacion.navigateRoot('/agenda'); }
}
