import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function exists(path: string) { try { await access(path); return true; } catch { return false; } }

export async function ndiRuntime() {
  const candidates = process.platform === 'win32'
    ? [process.env.NDI_LIBRARY_PATH, process.env.NDI_RUNTIME_DIR_V6 && join(process.env.NDI_RUNTIME_DIR_V6, 'Processing.NDI.Lib.x64.dll'),
       'C:/Program Files/NDI/NDI 6 Runtime/v6/Processing.NDI.Lib.x64.dll',
       'C:/Program Files/NDI/NDI 6 SDK/Bin/x64/Processing.NDI.Lib.x64.dll']
    : [process.env.NDI_LIBRARY_PATH, '/opt/server-dtv/ndi/lib/x86_64-linux-gnu/libndi.so.6', '/usr/local/lib/libndi.so.6'];
  let library: string | undefined;
  for (const candidate of candidates) if (candidate && await exists(candidate)) { library = candidate; break; }
  const scripts = [resolve('scripts/ndi-receiver.py'), resolve('../../scripts/ndi-receiver.py')];
  let script: string | undefined;
  for (const candidate of scripts) if (await exists(candidate)) { script = candidate; break; }
  return { library, script, python: process.env.NDI_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    platform: process.platform,
    error: !library ? `Runtime NDI ${process.platform === 'win32' ? 'Windows x64' : 'Linux'} não encontrado. Instale o SDK correspondente e configure NDI_LIBRARY_PATH.` : !script ? 'Receptor NDI não encontrado.' : null };
}

export async function startNdi(source: string) {
  if (!source?.trim() || source.length > 512) throw new Error('Selecione uma fonte NDI válida.');
  const runtime = await ndiRuntime();
  if (runtime.error) throw new Error(runtime.error);
  const child = spawn(runtime.python, [runtime.script!, '--library', runtime.library!, '--source', source], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  return child;
}

export function stopNdi(child: Awaited<ReturnType<typeof startNdi>>) {
  // Let Python stop its encoder before exiting, including on Windows.
  child.stdin.end('stop\n');
  const timeout = setTimeout(() => { if (child.exitCode === null) child.kill(); }, 6000);
  timeout.unref();
  child.once('close', () => clearTimeout(timeout));
}

export async function discoverNdi() {
  const runtime = await ndiRuntime();
  if (runtime.error) return { ok: false, available: false, platform: runtime.platform, sources: [], erro: runtime.error };
  return await new Promise<object>(resolveResult => {
    const child = spawn(runtime.python, [runtime.script!, '--library', runtime.library!, '--list'], { windowsHide: true });
    let output = '', error = '';
    const timer = setTimeout(() => child.kill(), 10000);
    child.stdout.on('data', value => { output = (output + value).slice(-100000); });
    child.stderr.on('data', value => { error = (error + value).slice(-2000); });
    child.on('error', cause => { clearTimeout(timer); resolveResult({ ok: false, available: false, sources: [], erro: `Python/NDI: ${cause.message}` }); });
    child.on('close', code => {
      clearTimeout(timer);
      try { if (code !== 0) throw new Error(error || 'O localizador NDI foi interrompido.'); resolveResult({ ...JSON.parse(output), available: true, platform: runtime.platform }); }
      catch (cause) { resolveResult({ ok: false, available: false, sources: [], erro: String(cause) }); }
    });
  });
}
