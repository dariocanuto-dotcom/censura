import { link, unlink } from 'node:fs/promises';
import { extname } from 'node:path';

export function recordingFileName(date: Date, format: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const p = (key: string) => parts.find(part => part.type === key)!.value;
  return `${p('day')}${p('month')}${p('year')}_${p('hour')}h${p('minute')}.${format}`;
}

/** Publish without replacing an existing block, including after a restart. */
export async function finalizeRecording(source: string, destination: string) {
  const extension = extname(destination);
  for (let sequence = 1; ; sequence++) {
    const target = sequence === 1 ? destination : `${destination.slice(0, -extension.length)}_${String(sequence).padStart(2, '0')}${extension}`;
    try { await link(source, target); }
    catch (error: any) { if (error.code === 'EEXIST') continue; throw error; }
    await unlink(source);
    return target;
  }
}
