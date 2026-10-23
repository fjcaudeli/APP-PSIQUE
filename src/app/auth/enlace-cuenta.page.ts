import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { mensajeErrorAcceso } from './error-acceso';

@Component({ selector: 'app-enlace-cuenta', standalone: true,
  imports: [IonContent, ReactiveFormsModule, RouterLink], templateUrl: './enlace-cuenta.page.html', styleUrl: './acceso.scss' })
export class EnlaceCuentaPage {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly confirmacion = this.route.snapshot.data['confirmacion'] === true;
  // El fragmento no viaja al servidor web ni se conserva en el historial al enviar.
  private readonly token = new URLSearchParams(this.route.snapshot.fragment ?? '').get('token') ?? '';
  readonly enlaceValido = /^[A-Za-z0-9_-]{43}$/.test(this.token);
  readonly formulario = inject(FormBuilder).nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    repetirPassword: ['', [Validators.required, Validators.maxLength(128)]],
  }, { validators: (grupo: AbstractControl) => grupo.get('password')?.value === grupo.get('repetirPassword')?.value ? null : { passwordsDistintos: true } });
  cargando = false;
  completado = false;
  mensaje = '';
  error = '';
  enviar(): void {
    if (this.cargando || this.completado || !this.enlaceValido) return;
    this.error = '';
    if (!this.confirmacion) {
      this.formulario.markAllAsTouched();
      if (this.formulario.invalid) return;
    }
    this.cargando = true;
    const { password, repetirPassword } = this.formulario.getRawValue();
    const solicitud = this.confirmacion ? this.auth.confirmarEmail(this.token) : this.auth.restablecerPassword(this.token, password, repetirPassword);
    solicitud.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; })).subscribe({
      next: respuesta => {
        this.completado = true; this.mensaje = respuesta.mensaje; this.formulario.reset();
        void this.router.navigate([], { relativeTo: this.route, fragment: undefined, replaceUrl: true });
        // El restablecimiento no inicia una sesión automáticamente.
        if (!this.confirmacion && this.auth.autenticado()) this.auth.cerrarSesion();
      },
      error: error => { this.error = mensajeErrorAcceso(error, 'No se pudo completar la operación. Solicitá otro enlace.'); },
    });
  }
}
