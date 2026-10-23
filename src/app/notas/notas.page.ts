import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonContent, IonModal, NavController } from '@ionic/angular';
import { finalize, Subscription } from 'rxjs';
import { SesionAgendada } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';

@Component({
  selector: 'app-notas', standalone: true,
  imports: [DatePipe, RouterLink, IonContent, IonModal],
  templateUrl: './notas.page.html', styleUrl: './notas.page.scss',
})
export class NotasPage implements OnDestroy {
  private readonly sesiones = inject(SesionesService);
  private readonly navegacion = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  @ViewChild(IonModal) private modal?: IonModal;
  @ViewChild(IonModal, { read: ElementRef }) private elementoModal?: ElementRef<HTMLElement>;
  notas: SesionAgendada[] = [];
  notaSeleccionada?: SesionAgendada;
  cargando = false;
  error = '';

  ionViewWillEnter(): void { this.cargar(); }
  ionViewWillLeave(): void {
    this.carga?.unsubscribe();
    void this.cerrarNota();
    this.notas = [];
  }

  cargar(): void {
    this.carga?.unsubscribe();
    this.cargando = true; this.error = ''; this.notas = [];
    // Reutilizamos las reservas de la cuenta: una próxima sesión por paciente,
    // incluidas las que no tienen Nota. No copiamos textos al histórico.
    this.carga = this.sesiones.agendadas().pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.cargando = false; })).subscribe({
      next: sesiones => { this.notas = sesiones.filter(s => s.esProxima); },
      error: () => { this.error = 'No se pudieron cargar las notas. Volvé a intentar.'; },
    });
  }

  abrirNota(sesion: SesionAgendada): void { this.notaSeleccionada = sesion; }
  alCerrarNota(): void { this.notaSeleccionada = undefined; }
  async cerrarNota(): Promise<void> { await this.modal?.dismiss(); this.alCerrarNota(); }
  async abrirFicha(evento: Event): Promise<void> {
    evento.preventDefault();
    const codigo = this.notaSeleccionada?.codigoPaciente;
    await this.cerrarNota();
    if (codigo) await this.navegacion.navigateForward(['/pacientes', codigo]);
  }
  ngOnDestroy(): void {
    this.carga?.unsubscribe();
    this.notaSeleccionada = undefined;
    // Ionic coloca el modal en el body: no debe sobrevivir al cierre de sesión.
    this.elementoModal?.nativeElement.remove();
  }
}
