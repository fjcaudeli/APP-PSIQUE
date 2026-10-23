import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonRouterLinkWithHref } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, Subscription } from 'rxjs';
import { Sesion } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';

@Component({
  selector: 'app-paciente-historico', standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, IonBackButton, IonContent, IonRouterLinkWithHref],
  templateUrl: './paciente-historico.page.html', styleUrl: './paciente-historico.page.scss',
})
export class PacienteHistoricoPage {
  private readonly servicio = inject(SesionesService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  private parametros?: Subscription;
  @ViewChild(IonContent) private contenido?: IonContent;
  readonly iconoVolver = arrowBackOutline;
  codigoPaciente = '';
  sesiones: Sesion[] = [];
  cargando = false;
  error = '';
  readonly tamanioPagina = 5;
  paginaActual = 1;

  get totalPaginas(): number { return Math.max(1, Math.ceil(this.sesiones.length / this.tamanioPagina)); }
  get sesionesPagina(): Sesion[] {
    const desde = (this.paginaActual - 1) * this.tamanioPagina;
    return this.sesiones.slice(desde, desde + this.tamanioPagina);
  }

  cambiarPagina(pagina: number): void {
    if (this.cargando || this.error || !Number.isInteger(pagina) || pagina < 1 || pagina > this.totalPaginas || pagina === this.paginaActual) return;
    this.paginaActual = pagina;
    void this.contenido?.scrollToTop(0);
  }

  get destinoVolver(): string { return this.codigoPaciente ? '/pacientes/' + encodeURIComponent(this.codigoPaciente) : '/pacientes'; }

  ionViewWillEnter(): void {
    this.parametros?.unsubscribe();
    this.parametros = this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(parametros => {
      const codigo = parametros.get('codigo') ?? '';
      if (codigo !== this.codigoPaciente) this.paginaActual = 1;
      this.codigoPaciente = codigo;
      this.cargar();
    });
  }

  ionViewWillLeave(): void {
    this.parametros?.unsubscribe();
    this.carga?.unsubscribe();
    this.sesiones = [];
  }

  cargar(): void {
    this.carga?.unsubscribe();
    this.error = ''; this.sesiones = [];
    if (!this.codigoPaciente) { this.error = 'Paciente no encontrado.'; this.cargando = false; return; }
    this.cargando = true;
    // Se vuelve a consultar al regresar del detalle para reflejar correcciones
    // de resumen, cobros o asistencia, sin mantener un segundo historial local.
    this.carga = this.servicio.historialPaciente(this.codigoPaciente)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; }))
      .subscribe({
        next: sesiones => {
          // La API mantiene el orden por fecha y hora descendentes. Conservamos
          // la página al volver del detalle y la ajustamos si el listado se acortó.
          this.sesiones = sesiones;
          this.paginaActual = Math.min(this.paginaActual, this.totalPaginas);
        },
        error: (error: HttpErrorResponse) => {
          this.error = error.status === 404 ? 'Paciente no encontrado.' : 'No se pudo cargar el histórico de sesiones. Volvé a intentar.';
        },
      });
  }
}
