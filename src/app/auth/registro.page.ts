import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { finalize } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { mensajeErrorAcceso } from './error-acceso';

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [IonContent, ReactiveFormsModule, RouterLink],
  templateUrl: './registro.page.html',
  styleUrl: './acceso.scss',
})
export class RegistroPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formularios = inject(FormBuilder).nonNullable;
  cargando = false;
  error = '';

  readonly formulario = this.formularios.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    repetirPassword: ['', [Validators.required, Validators.maxLength(128)]],
  }, {
    // La comparación pertenece al grupo porque necesita leer ambos campos.
    validators: (grupo: AbstractControl) => grupo.get('password')?.value === grupo.get('repetirPassword')?.value
      ? null : { passwordsDistintos: true },
  });

  registrarse(): void {
    if (this.cargando) return;
    this.error = '';
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;
    this.cargando = true;
    const datos = this.formulario.getRawValue();
    this.auth.registrarse({ ...datos, email: datos.email.trim() }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.cargando = false; }),
    ).subscribe({
      // Registrar una cuenta no inicia sesión: el acceso ocurre en Login.
      next: () => { void this.router.navigateByUrl('/login', { replaceUrl: true, state: { registroCompleto: true } }); },
      error: (error: unknown) => { this.error = mensajeErrorAcceso(error, 'No se pudo crear la cuenta. Volvé a intentar.'); },
    });
  }
}
