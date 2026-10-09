import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { RespuestaLogin, Usuario } from '../models/usuario';

interface SesionLocal {
  token: string;
  usuario: Usuario;
  vencimiento: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly claveAlmacenamiento = 'psique.sesion';
  private readonly sesion = signal<SesionLocal | null>(null);
  private temporizador?: ReturnType<typeof setTimeout>;

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly autenticado = computed(() => this.sesion() !== null);
  readonly aviso = signal('');

  constructor() {
    // sessionStorage conserva la sesión al recargar esta pestaña. No guardamos
    // contraseñas y no usamos localStorage para mantenerla al cerrar el navegador.
    try {
      const guardado = sessionStorage.getItem(this.claveAlmacenamiento);
      if (guardado) {
        const datos = JSON.parse(guardado) as Partial<SesionLocal>;
        const vencimiento = this.leerVencimiento(datos.token);
        if (vencimiento && datos.usuario && Number.isSafeInteger(datos.usuario.id)
          && datos.usuario.id > 0 && typeof datos.usuario.email === 'string'
          && typeof datos.usuario.fechaCreacion === 'string') {
          this.sesion.set({ token: datos.token!, usuario: datos.usuario, vencimiento });
          this.programarVencimiento();
          return;
        }
      }
    } catch {
      // Un almacenamiento bloqueado o inválido no debe habilitar una ruta privada.
    }
    this.borrarSesion();
  }

  registrarse(datos: { email: string; password: string; repetirPassword: string }): Observable<{ usuario: Usuario }> {
    return this.http.post<{ usuario: Usuario }>(`${API_BASE_URL}/auth/registro`, datos);
  }

  iniciarSesion(datos: { email: string; password: string }): Observable<RespuestaLogin> {
    return this.http.post<RespuestaLogin>(`${API_BASE_URL}/auth/login`, datos).pipe(
      tap((respuesta) => {
        const vencimiento = this.leerVencimiento(respuesta.token);
        if (!vencimiento) throw new Error('La respuesta de acceso no contiene una sesión válida.');
        const sesion = { token: respuesta.token, usuario: respuesta.usuario, vencimiento };
        this.sesion.set(sesion);
        this.aviso.set('');
        try { sessionStorage.setItem(this.claveAlmacenamiento, JSON.stringify(sesion)); } catch { /* Continúa en memoria. */ }
        this.programarVencimiento();
      }),
    );
  }

  obtenerToken(): string | null {
    const sesion = this.sesion();
    if (sesion && sesion.vencimiento <= Date.now()) this.expirarSesion(sesion.token);
    return this.sesion()?.token ?? null;
  }

  esTokenActual(token: string): boolean { return this.sesion()?.token === token; }

  cerrarSesion(): void {
    this.borrarSesion();
    this.aviso.set('');
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  expirarSesion(token: string): void {
    // Una respuesta tardía de una sesión anterior no puede cerrar una nueva cuenta.
    if (!this.esTokenActual(token)) return;
    this.borrarSesion();
    this.aviso.set('Tu sesión venció o ya no es válida. Iniciá sesión nuevamente.');
    void this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  private borrarSesion(): void {
    clearTimeout(this.temporizador);
    this.sesion.set(null);
    try { sessionStorage.removeItem(this.claveAlmacenamiento); } catch { /* Puede estar bloqueado. */ }
  }

  private programarVencimiento(): void {
    clearTimeout(this.temporizador);
    const sesion = this.sesion();
    if (sesion) this.temporizador = setTimeout(() => this.expirarSesion(sesion.token), sesion.vencimiento - Date.now());
  }

  private leerVencimiento(token: unknown): number | null {
    // Leer exp solo permite actualizar la interfaz cuando vence el token.
    // NO verifica su autenticidad: Express valida la firma y autoriza cada consulta.
    if (typeof token !== 'string' || token.split('.').length !== 3) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
      return typeof payload.exp === 'number' && Number.isSafeInteger(payload.exp)
        && payload.exp * 1000 > Date.now() ? payload.exp * 1000 : null;
    } catch { return null; }
  }
}
