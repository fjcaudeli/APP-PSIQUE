import { ResumenDashboard } from '../models/dashboard';

// Son ejemplos fijos para presentar el Dashboard: todavía no se calculan
// a partir de los pacientes, los turnos ni los pagos del consultorio.
export const RESUMEN_DASHBOARD_MOCK: ResumenDashboard = {
  pacientesActivos: 3,
  sesionesSemana: 8,
  pendientesCobro: 2,
  horariosDisponibles: 4,
};
