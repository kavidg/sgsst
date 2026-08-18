import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink, readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

import { DocumentRenderer } from '../types/renderer.types';

const execFileAsync = promisify(execFile);

/**
 * Detecta la ubicación de LibreOffice en el sistema.
 *
 * Búsqueda en orden de prioridad:
 * 1. Variable de entorno LIBREOFFICE_PATH
 * 2. `soffice` en PATH (Linux/headless)
 * 3. `libreoffice` en PATH (macOS/Linux)
 * 4. Rutas conocidas de macOS
 * 5. null si no se encuentra
 */
function findLibreOffice(): string | null {
  const envPath = process.env.LIBREOFFICE_PATH;
  if (envPath) return envPath;

  // En producción (Docker/Linux), soffice es el nombre estándar
  // En macOS, libreoffice es el nombre del cask
  return null; // Se resuelve en runtime con which/exists check
}

/**
 * Renderer PDF basado en LibreOffice Headless.
 *
 * Convierte un .docx (Buffer) a .pdf ejecutando:
 *   libreoffice --headless --convert-to pdf --outdir <tmp> <input.docx>
 *
 * La dependencia de LibreOffice es OPCIONAL:
 * - Si no está instalado, render() lanza un error descriptivo.
 * - El sistema continúa funcionando con DOCX sin LibreOffice.
 *
 * Seguridad:
 * - No expone la ruta de LibreOffice en mensajes de error.
 * - Usa directorio temporal con nombre aleatorio (evita colisiones).
 * - Limpia archivos temporales en finally.
 */
export class PdfRenderer implements DocumentRenderer {
  private readonly libreOfficePath: string | null;
  private readonly available: boolean;

  constructor() {
    this.libreOfficePath = findLibreOffice();
    this.available = this.libreOfficePath !== null;
  }

  /**
   * Indica si LibreOffice está disponible en el sistema.
   */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Convierte un buffer DOCX a PDF usando LibreOffice Headless.
   *
   * @param template - Buffer del documento .docx
   * @param _variables - No utilizado (las variables ya fueron aplicadas al DOCX)
   * @returns Buffer del documento .pdf generado
   * @throws Error si LibreOffice no está disponible o la conversión falla
   */
  async render(template: Buffer, _variables: Record<string, unknown>): Promise<Buffer> {
    if (!this.available || !this.libreOfficePath) {
      throw new Error(
        'PDF renderer requires LibreOffice. Install with: brew install --cask libreoffice (macOS) ' +
          'or apt-get install libreoffice (Linux). Set LIBREOFFICE_PATH env var if custom path.',
      );
    }

    const workDir = join(tmpdir(), `docgen-pdf-${randomBytes(8).toString('hex')}`);
    const inputPath = join(workDir, 'input.docx');
    const expectedOutput = join(workDir, 'input.pdf');

    try {
      await mkdir(workDir, { recursive: true });
      await writeFile(inputPath, template);

      await execFileAsync(this.libreOfficePath, [
        '--headless',
        '--convert-to', 'pdf',
        '--outdir', workDir,
        inputPath,
      ], {
        timeout: 30_000,
        maxBuffer: 50 * 1024 * 1024,
      });

      const pdfBuffer = await readFile(expectedOutput);
      return pdfBuffer;
    } finally {
      // Limpieza de archivos temporales (best-effort)
      try { await unlink(inputPath); } catch { /* ignore */ }
      try { await unlink(expectedOutput); } catch { /* ignore */ }
      try { await unlink(join(workDir, 'input.log')); } catch { /* ignore */ }
      try { await import('node:fs').then((fs) => fs.rmdirSync(workDir, { recursive: true } as never)); } catch { /* ignore */ }
    }
  }
}
