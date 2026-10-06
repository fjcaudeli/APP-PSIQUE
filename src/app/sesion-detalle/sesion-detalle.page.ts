import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonRouterLinkWithHref } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, Subscription } from 'rxjs';
import { Sesion } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';
import { aCentavos, aPesos, importeValido } from '../shared/importes';
import { yaTranscurrio } from '../shared/tiempo';

@Component({
  selector: 'app-sesion-detalle', standalone: true,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink, IonRouterLinkWithHref, IonBackButton, IonContent],
  templateUrl: './sesion-detalle.page.html', styleUrl: './sesion-detalle.page.scss',
})
export class SesionDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly sesionesService = inject(SesionesService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  readonly iconoVolver = arrowBackOutline;
  readonly formulario = inject(FormBuilder).nonNullable.group({ importe: ['0.00', importeValido], pagado: ['0.00', importeValido] });
  sesion?: Sesion;
  cargando = true;
  guardando = false;
  errorCarga = '';
  errorGuardado = '';
  mensaje = '';

  ionViewWillEnter(): void {
    this.mensaje = this.route.snapshot.queryParamMap.get('creado') === '1' ? 'Paciente creado y sesión agendada.'
      : this.route.snapshot.queryParamMap.get('agendada') === '1' ? 'Sesión agendada.' : '';
    this.cargar();
  }

  cargar(): void {
    this.carga?.unsubscribe();
    this.cargando = true;
    this.errorCarga = '';
    this.errorGuardado = '';
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id < 1) { this.errorCarga = 'Sesión no encontrada.'; this.cargando = false; return; }
    this.carga = this.sesionesService.obtener(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; }))
      .subscribe({ next: (sesion) => { this.sesion = sesion; this.restaurarImportes(); }, error: (error: HttpErrorResponse) => { this.errorCarga = error.status === 404 ? 'Sesión no encontrada.' : 'No se pudo cargar la sesión. Volvé a intentar.'; } });
  }

  get puedeRealizar(): boolean { return !!this.sesion && yaTranscurrio(this.sesion.fecha, this.sesion.horario); }

  restaurarImportes(): void {
    if (this.guardando || !this.sesion) return;
    this.formulario.reset({ importe: aPesos(this.sesion.importeCentavos), pagado: aPesos(this.sesion.pagadoCentavos) });
    this.errorGuardado = '';
  }

  guardarImportes(): void {
    if (this.guardando || !this.sesion) return;
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;
    const importe = aCentavos(this.formulario.controls.importe.value);
    const pagado = aCentavos(this.formulario.controls.pagado.value);
    if (importe === null || pagado === null) return;
    if (pagado > importe) { this.errorGuardado = 'El total cobrado no puede superar los honorarios de la sesión.'; return; }
    this.guardando = true;
    this.errorGuardado = '';
    this.mensaje = '';
    this.sesionesService.actualizar(this.sesion.id, importe, pagado).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }))
      .subscribe({ next: (sesion) => {
        this.sesion = sesion;
        this.formulario.reset({ importe: aPesos(sesion.importeCentavos), pagado: aPesos(sesion.pagadoCentavos) });
        this.mensaje = 'Importes guardados.';
      }, error: (error: HttpErrorResponse) => { this.errorGuardado = error.error?.mensaje ?? 'No se pudieron guardar los importes. Volvé a intentar.'; } });
  }

  realizar(): void {
    if (this.guardando || !this.sesion || !this.puedeRealizar || this.sesion.estado === 'Realizada') return;
    this.guardando = true;
    this.errorGuardado = '';
    this.mensaje = '';
    this.sesionesService.realizar(this.sesion.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }))
      .subscribe({ next: (sesion) => { this.sesion = sesion; this.mensaje = 'Sesión marcada como realizada.'; },
        error: (error: HttpErrorResponse) => { this.errorGuardado = error.error?.mensaje ?? 'No se pudo marcar la sesión. Volvé a intentar.'; } });
  }
}
