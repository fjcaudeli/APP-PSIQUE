import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { mensajeErrorAcceso } from './error-acceso';

@Component({ selector: 'app-solicitar-correo', standalone: true,
  imports: [IonContent, ReactiveFormsModule, RouterLink], templateUrl: './solicitar-correo.page.html', styleUrl: './acceso.scss' })
export class SolicitarCorreoPage {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly confirmacion = inject(ActivatedRoute).snapshot.data['confirmacion'] === true;
  readonly formulario = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
  });
  cargando = false;
  mensaje = '';
  error = '';
  enviar(): void {
    if (this.cargando) return;
    this.error = ''; this.mensaje = ''; this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;
    this.cargando = true;
    const email = this.formulario.controls.email.value.trim();
    const solicitud = this.confirmacion ? this.auth.reenviarConfirmacion(email) : this.auth.solicitarRecuperacion(email);
    solicitud.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; })).subscribe({
      next: respuesta => { this.mensaje = respuesta.mensaje; },
      error: error => { this.error = mensajeErrorAcceso(error, 'No se pudo solicitar el correo. Volvé a intentar.'); },
    });
  }
}
