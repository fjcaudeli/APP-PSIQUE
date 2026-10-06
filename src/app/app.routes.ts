import { Routes } from '@angular/router';

// Al abrir la aplicación se muestra Inicio.
// Cada pantalla se carga cuando el navegador accede a su ruta.
export const routes: Routes = [
  {
    path: 'pacientes/nuevo',
    title: 'PSIQUE · Crear paciente',
    loadComponent: () => import('./paciente-crear/paciente-crear.page').then((page) => page.PacienteCrearPage),
  },
  {
    path: 'inicio',
    title: 'PSIQUE · Inicio',
    loadComponent: () => import('./inicio/inicio.page').then((page) => page.InicioPage),
  },
  {
    // :codigo es un parámetro: por ejemplo, toma el valor P-001 en /pacientes/P-001.
    path: 'pacientes/:codigo',
    title: 'PSIQUE · Ficha del paciente',
    loadComponent: () => import('./paciente-detalle/paciente-detalle.page').then((page) => page.PacienteDetallePage),
  },
  {
    path: 'pacientes',
    title: 'PSIQUE · Pacientes',
    loadComponent: () => import('./pacientes/pacientes.page').then((page) => page.PacientesPage),
  },
  {
    path: 'agenda/agendar',
    title: 'PSIQUE · Agendar sesión',
    loadComponent: () => import('./agendar/agendar.page').then((page) => page.AgendarPage),
  },
  {
    path: 'sesiones',
    title: 'PSIQUE · Sesiones de la semana',
    loadComponent: () => import('./sesiones/sesiones.page').then((page) => page.SesionesPage),
  },
  {
    path: 'sesiones/:id',
    title: 'PSIQUE · Detalle de sesión',
    loadComponent: () => import('./sesion-detalle/sesion-detalle.page').then((page) => page.SesionDetallePage),
  },
  {
    path: 'agenda',
    title: 'PSIQUE · Agenda',
    loadComponent: () => import('./agenda/agenda.page').then((page) => page.AgendaPage),
  },
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: '**', redirectTo: 'inicio' },
];
