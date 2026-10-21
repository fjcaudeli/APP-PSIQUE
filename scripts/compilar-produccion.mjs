import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarUrlApi } from '../src/environments/configuracion-api.ts';

try {
  const url = validarUrlApi(process.env.PSIQUE_API_URL, true);
  // Se pasan argumentos, no un comando construido para PowerShell. La URL es
  // pública, no un secreto; Angular la incorpora al JavaScript que descarga el navegador.
  const cli = fileURLToPath(new URL('../node_modules/@angular/cli/bin/ng.js', import.meta.url));
  const resultado = spawnSync(process.execPath, [cli, 'build', '--configuration', 'production',
    `--define=PSIQUE_API_URL=${JSON.stringify(url)}`], { stdio: 'inherit', windowsHide: true });
  process.exitCode = resultado.status ?? 1;
} catch {
  console.error('No se compiló producción: definí PSIQUE_API_URL con la URL HTTPS de Express terminada en /api. No se utiliza localhost como reemplazo.');
  process.exitCode = 1;
}
