import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { mensajeErrorAcceso } from './error-acceso';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonContent, ReactiveFormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrl: './acceso.scss',
})
export class LoginPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formularios = inject(FormBuilder).nonNullable;
  readonly registroCompleto = this.router.getCurrentNavigation()?.extras.state?.['registroCompleto'] === true;
  cargando = false;
  error = '';

  readonly formulario = this.formularios.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  entrar(): void {
    if (this.cargando) return;
    this.error = '';
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;
    this.cargando = true;
    const datos = this.formulario.getRawValue();
    // El email se puede normalizar. La contraseña se envía exactamente como se escribió.
    this.auth.iniciarSesion({ email: datos.email.trim(), password: datos.password }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.cargando = false; }),
    ).subscribe({
      next: () => { void this.router.navigateByUrl('/inicio', { replaceUrl: true }); },
      error: (error: unknown) => { this.error = mensajeErrorAcceso(error, 'No se pudo iniciar sesión. Volvé a intentar.'); },
    });
  }
}
