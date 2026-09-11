import { Routes } from '@angular/router';

// Al abrir la aplicación se muestra Inicio.
// Cada pantalla se carga cuando el navegador accede a su ruta.
export const routes: Routes = [
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
    path: 'agenda',
    title: 'PSIQUE · Agenda',
    loadComponent: () => import('./agenda/agenda.page').then((page) => page.AgendaPage),
  },
  { path: '', redirectTo: 'inicio', pathMatch: 'full' },
  { path: '**', redirectTo: 'inicio' },
];
