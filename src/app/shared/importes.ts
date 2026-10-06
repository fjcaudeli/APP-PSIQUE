import { AbstractControl, ValidationErrors } from '@angular/forms';

// La API y SQLite utilizan centavos enteros; el formulario acepta coma o punto.
export function aCentavos(valor: unknown): number | null {
  const texto = String(valor ?? '').trim();
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(texto)) return null;
  const [entero, decimales = ''] = texto.replace(',', '.').split('.');
  const centavos = Number(entero) * 100 + Number(decimales.padEnd(2, '0'));
  return centavos <= 999999999 ? centavos : null;
}

export function importeValido(control: AbstractControl): ValidationErrors | null {
  return aCentavos(control.value) === null ? { importe: true } : null;
}

export function aPesos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}
