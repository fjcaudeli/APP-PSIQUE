import { DatePipe } from '@angular/common';
import { Component, ElementRef, EventEmitter, inject, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonModal, IonRouterLinkWithHref, NavController } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { CalendarioAgenda, DiaCalendario } from '../models/sesion';
import { PacientesService } from '../services/pacientes.service';
import { desplazarFecha, nombreDia } from './tiempo';

@Component({
  selector: 'app-calendario', standalone: true, imports: [DatePipe, RouterLink, IonRouterLinkWithHref, IonModal],
  templateUrl: './calendario.component.html', styleUrl: './calendario.component.scss',
})
export class CalendarioComponent implements OnDestroy {
  private readonly pacientes = inject(PacientesService);
  private readonly navegacion = inject(NavController);
  private consultaNota?: Subscription;
  @ViewChild(IonModal) private modal?: IonModal;
  @ViewChild(IonModal, { read: ElementRef }) private elementoModal?: ElementRef<HTMLElement>;
  @Input({ required: true }) calendario!: CalendarioAgenda;
  @Input() fechaVisible = '';
  @Input() cargando = false;
  @Input() error = '';
  @Output() elegirDia = new EventEmitter<string>();
  @Output() cambiarSemana = new EventEmitter<string>();
  notaSesion?: { codigo: string; fecha: string; horario: string };
  nota = '';
  cargandoNota = false;
  errorNota = '';
  get lunes(): string {
    const fecha = this.fechaVisible || this.calendario.desde;
    return desplazarFecha(fecha, -((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7));
  }
  get domingo(): string { return desplazarFecha(this.lunes, 6); }
  get permiteSiguiente(): boolean { return desplazarFecha(this.lunes, 7) <= this.calendario.hasta; }
  get dias(): DiaCalendario[] {
    return Array.from({ length: 7 }, (_, i) => {
      const fecha = desplazarFecha(this.lunes, i);
      return this.calendario.dias.find(d => d.fecha === fecha) ?? { fecha, nombre: nombreDia(fecha), habilitado: false, libres: [], ocupadas: [] };
    });
  }
  bloquesDelDia(dia: DiaCalendario) {
    // Intercalamos las franjas libres y las sesiones por su hora de inicio:
    // así se ve el espacio disponible antes, entre y después de las reservas.
    return [
      ...dia.ocupadas.map(sesion => ({ tipo: 'sesion' as const, clave: `sesion-${sesion.id}`, inicio: sesion.horario, sesion })),
      ...(dia.habilitado ? dia.libres : []).map(libre => ({ tipo: 'libre' as const, clave: `libre-${libre.desde}`, inicio: libre.desde, libre })),
    ].sort((a, b) => a.inicio.localeCompare(b.inicio));
  }
  moverSemana(dias: number): void { this.cambiarSemana.emit(desplazarFecha(this.lunes, dias)); }
  abrirNota(dia: DiaCalendario, sesion: DiaCalendario['ocupadas'][number]): void {
    if (!sesion.esProxima) return;
    this.consultaNota?.unsubscribe();
    this.notaSesion = { codigo: sesion.codigoPaciente, fecha: dia.fecha, horario: sesion.horario };
    this.nota = ''; this.errorNota = ''; this.cargandoNota = true;
    // Se consulta la Nota vigente de la ficha, sin copiarla al resumen histórico.
    this.consultaNota = this.pacientes.obtenerPacientePorCodigo(sesion.codigoPaciente).subscribe({
      next: paciente => { this.cargandoNota = false; if (paciente) this.nota = paciente.postIt; else this.errorNota = 'Paciente no encontrado.'; },
      error: () => { this.cargandoNota = false; this.errorNota = 'No se pudo consultar la Nota. Cerrá la nota y volvé a intentar.'; },
    });
  }
  async cerrarNota(): Promise<void> { this.consultaNota?.unsubscribe(); await this.modal?.dismiss(); this.alCerrarNota(); }
  alCerrarNota(): void { this.consultaNota?.unsubscribe(); this.notaSesion = undefined; this.nota = ''; this.errorNota = ''; }
  async abrirFicha(): Promise<void> {
    const codigo = this.notaSesion?.codigo;
    await this.cerrarNota();
    if (codigo) await this.navegacion.navigateForward(['/pacientes', codigo]);
  }
  ngOnDestroy(): void {
    this.consultaNota?.unsubscribe();
    // Ionic mueve el modal al body; al cerrar sesión no debe quedar una nota visible.
    this.elementoModal?.nativeElement.remove();
  }
}
