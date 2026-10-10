import { recordingFileName, finalizeRecording } from './recording-file.ts';
import { startNdi, stopNdi } from './ndi.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat, statfs, unlink, readdir } from 'node:fs/promises';
import { join, resolve, isAbsolute, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { captureTransport } from './raw-recording.ts';

export interface ChannelConfig {
  id: string; name: string; url: string; directory: string; enabled: boolean;
  codec: 'h264' | 'h265' | 'copy'; format: 'mp4' | 'mkv' | 'ts'; videoKbps: number; audioKbps: number;
  retentionDays: number; width: number; height: number; blockMinutes?: number; programId?: number;
  startAt?: string; endAt?: string;
  captureMode?: 'source' | 'pvw'; captionPid?: number;
}
export interface RecordingFile { id: string; channelId: string; channel: string; path: string; start: string; end: string; bytes: number; codec: string; format: string; programId?:number }
interface Store { channels: ChannelConfig[]; files: RecordingFile[]; audit: { time: string; channelId: string; action: string; detail: string }[] }
interface Running { lastProgress:number; progressKey?:string; root?: string; ndi?: Awaited<ReturnType<typeof startNdi>>; process: ChildProcess; csv: string; config: ChannelConfig; started: number; error: string; seen: Set<string>; stopping: boolean; rawCompletion?:Promise<void>; prefix?:string; activeBlock?:{name:string;start:string;end:string;bytes:number} }
const stateDir = resolve('.runtime/recording-service');
const stateFile = join(stateDir, 'state.json');
let state: Store = { channels: [], files: [], audit: [] };
const running = new Map<string, Running>();
let timer: ReturnType<typeof setInterval> | undefined;
let busy = false;
let shuttingDown = false;
let ready = false;
let initialization: Promise<void> | undefined;
let saving = Promise.resolve();
let configuring=Promise.resolve();
const lastErrors = new Map<string, string>();
const retryAfter = new Map<string, number>();
const protectedFiles = new Map<string, number>();
let captionSaving=Promise.resolve();
let captionExpiry:ReturnType<typeof setTimeout>|undefined;
export function updateRecordingCaption(text: string) {
  if(typeof text!=='string'||text.length>1000)throw new Error('Texto de CC inválido.');
  const normalized=text.replace(/\r/g,'').split('\n').slice(-2).map(line=>line.replace(/[\u0000-\u0008\u000b-\u001f]/g,'').slice(0,100)).join('\n');
  if(captionExpiry)clearTimeout(captionExpiry);
  const write=(value:string)=>captionSaving=captionSaving.catch(()=>{}).then(async()=>{await mkdir(stateDir,{recursive:true});await writeFile(join(stateDir,'pvw-cc.txt.tmp'),value,'utf8');await rename(join(stateDir,'pvw-cc.txt.tmp'),join(stateDir,'pvw-cc.txt'));});
  captionExpiry=setTimeout(()=>{void write('').catch(()=>{});},3000);captionExpiry.unref();
  return write(normalized);
}
export function protectRecordings(ids: string[]) {
  for(const id of ids) protectedFiles.set(id,(protectedFiles.get(id) ?? 0)+1);
  return () => { for(const id of ids) { const count=(protectedFiles.get(id) ?? 1)-1; if(count) protectedFiles.set(id,count); else protectedFiles.delete(id); } };
}
export function channelSlug(name: string) { return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'Canal'; }
export function dayName(date: Date) { const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(date); return ['day','month','year'].map(k => parts.find(p => p.type === k)!.value).join(''); }
export function validateChannel(input: ChannelConfig): ChannelConfig {
  if (input.id !== '1') throw new Error('A gravação utiliza somente um canal.');
  if (!input.name?.trim() || !input.directory || !isAbsolute(input.directory)) throw new Error('Informe nome do canal e pasta absoluta no HD.');
  const url = new URL(input.url);
  if (!['srt:','udp:','rtp:','rtsp:','rtsps:','ndi:'].includes(url.protocol)) throw new Error('Fonte deve ser SRT, UDP, RTP ou RTSP.');
  if (input.codec === 'copy' && (url.protocol.startsWith('rtsp') || url.protocol === 'ndi:')) throw new Error('RTSP/NDI requer gravação H.264 ou H.265. BTS original exige MPEG-TS por SRT/UDP.');
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 90) throw new Error('Retenção deve ser de 1 a 90 dias.');
  if (!['copy','h264','h265'].includes(input.codec) || !(input.codec === 'copy' ? input.format === 'ts' : ['mp4','mkv'].includes(input.format))) throw new Error('Use TS para BTS original ou MP4/MKV para H.264 e H.265.');
  if(input.captureMode!==undefined&&!['source','pvw'].includes(input.captureMode))throw new Error('Modo de gravação inválido.');
  if(input.captureMode==='pvw'&&input.codec==='copy')throw new Error('Gravação do PVW com CC requer H.264 ou H.265.');
  if(input.captionPid!==undefined&&(!Number.isInteger(input.captionPid)||input.captionPid<0||input.captionPid>8191))throw new Error('PID de CC inválido.');
  if (input.blockMinutes !== undefined && ![1,2,5,10].includes(input.blockMinutes)) throw new Error('Blocos devem ter 1, 2, 5 ou 10 minutos.');
  if (!Number.isInteger(input.videoKbps) || input.videoKbps < 128 || input.videoKbps > 12000 || !Number.isInteger(input.audioKbps) || input.audioKbps < 32 || input.audioKbps > 320) throw new Error('Taxa de bits inválida.');
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 160 || input.width > 1920 || input.height < 90 || input.height > 1080 || input.width % 2 || input.height % 2) throw new Error('Resolução deve ser par, até 1920×1080.');
  if (input.programId !== undefined && (!Number.isInteger(input.programId) || input.programId < 0 || input.programId > 65535)) throw new Error('Programa inválido.');
  for (const value of [input.startAt, input.endAt]) if (value && !Number.isFinite(Date.parse(value))) throw new Error('Agendamento inválido.');
  if (input.startAt && input.endAt && Date.parse(input.endAt) <= Date.parse(input.startAt)) throw new Error('Fim deve ser posterior ao início.');
  return { ...input, blockMinutes: input.blockMinutes ?? 10, name: input.name.trim(), directory: resolve(input.directory), enabled: Boolean(input.enabled) };
}
function audit(channelId: string, action: string, detail: string) { state.audit.push({ time: new Date().toISOString(), channelId, action, detail }); state.audit = state.audit.slice(-3000); }
function save() {
  const content = JSON.stringify(state, null, 2);
  saving = saving.catch(() => {}).then(async () => { await mkdir(stateDir, { recursive: true }); await writeFile(stateFile + '.tmp', content); await rename(stateFile + '.tmp', stateFile); });
  return saving;
}
export function initRecordings() {
  return initialization ??= initializeRecordings().catch(error=>{initialization=undefined;ready=false;if(timer)clearInterval(timer);throw error;});
}
async function initializeRecordings() {
  if (ready) return;
  await mkdir(stateDir, { recursive: true });
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
  ready = true;
  // Finalized blocks from a previous interrupted process remain recoverable.
  for (const config of state.channels) await ingest({ config, csv: join(stateDir, `channel-${config.id}.csv`), started: 0, seen: new Set(), error: '', stopping: true } as Running);
  state.channels=state.channels.filter(c=>c.id==='1');
  for(const config of state.channels) {
    const legacy=resolve(config.directory,`DC-Censura-${config.id}-${channelSlug(config.name)}`);
    const monthly=(await readdir(config.directory,{withFileTypes:true}).catch(()=>[])).filter(entry=>entry.isDirectory()&&new RegExp(`^${channelSlug(config.name)}_(0[1-9]|1[0-2])\\d{4}$`).test(entry.name)).map(entry=>join(config.directory,entry.name));
    for(const root of [legacy,...monthly]) {
    for(const folder of await readdir(root,{withFileTypes:true}).catch(()=>[])) {
      if(!folder.isDirectory()||!folder.name.startsWith(`${channelSlug(config.name)}_`))continue;
      for(const name of await readdir(join(root,folder.name))) {
        if(!/^\d{8}(?:_?\d{2}h\d{2}_\d{2}_[a-f0-9]{8}\.ts(?:\.partial)?|_\d{2}h\d{2}(?:_\d+)?\.ts(?:_[a-f0-9]{8}\.partial)?)$/.test(name))continue;
        let path=join(root,folder.name,name);const info=await stat(path);if(!info.isFile()||!info.size)continue;
        if(name.endsWith('.partial')){const destination=path.replace(/(?:_[a-f0-9]{8})?\.partial$/,'');path=await finalizeRecording(path,destination);}
        if(state.files.some(file=>file.path===path))continue;
        state.files.push({id:randomUUID(),channelId:'1',channel:config.name,path,start:info.birthtime.toISOString(),end:info.mtime.toISOString(),bytes:info.size,codec:'copy',format:'ts'});
      }
    }
  }
  }
  timer = setInterval(() => { void tick().catch(error => audit('system', 'error', String(error))); }, 5000);
  timer.unref();
  await tick();
}
export function recordingRoot(config: ChannelConfig, date = new Date()) {
  const day = dayName(date);
  return resolve(config.directory, `${channelSlug(config.name)}_${day.slice(2)}`);
}
async function dailyFolders(config: ChannelConfig) {
  const root = recordingRoot(config);
  await mkdir(join(root, '.pending'), { recursive: true });
  return root;
}
export function recordingArgs(config: ChannelConfig, root: string, csv: string) {
  const map = config.programId === undefined ? '0' : `0:p:${config.programId}`;
  // Numeric staging prevents native FFmpeg timezone differences and name collisions.
  // A completed block is moved to its Brazilian date/time folder before indexing.
  const filename = join(root, '.pending', `${randomUUID()}_%09d.${config.format}`).replace(/\\/g, '/');
  const scale=`scale=w=${config.width}:h=${config.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`;
  const pvw=config.captureMode==='pvw';
  const captionFont=process.platform==='win32'?"C\\:/Windows/Fonts/consola.ttf":'/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf';
  return ['-hide_banner','-loglevel','warning','-probesize','1000000','-analyzeduration','3000000','-rw_timeout','10000000',
    ...(config.url.startsWith('rtsp') ? ['-rtsp_transport','tcp'] : []),
    '-i',config.url,
    '-map',`${map}:v:0`,'-vf',scale+(pvw?`,drawtext=fontfile='${captionFont}':textfile='.runtime/recording-service/pvw-cc.txt':reload=1:expansion=none:fontsize=w/80:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=8:x=(w-text_w)/2:y=h-text_h-20`:''),'-map',`${map}:a:0?`,
    '-c:v',config.codec === 'h265' ? 'libx265' : 'libx264','-preset','veryfast','-pix_fmt','yuv420p',
    '-b:v',`${config.videoKbps}k`,'-maxrate',`${config.videoKbps}k`,'-bufsize',`${config.videoKbps * 2}k`,
    '-force_key_frames','expr:gte(t,n_forced*2)','-c:a','aac','-b:a',`${config.audioKbps}k`,'-ar','48000',
    '-f','segment','-segment_time',String((config.blockMinutes ?? 2)*60),'-segment_atclocktime','1','-reset_timestamps','1',
    '-segment_format',config.format === 'mkv' ? 'matroska' : 'mp4',
    ...(config.format === 'mp4' ? ['-segment_format_options','movflags=+faststart'] : []),
    '-segment_list',csv,'-segment_list_type','csv','-segment_list_size','0',filename];
}
async function start(config: ChannelConfig) {
  if(config.captureMode==='pvw')await writeFile(join(stateDir,'pvw-cc.txt'),'','utf8');
  const root = await dailyFolders(config);
  const csv = join(stateDir, `channel-${config.id}.csv`);
  await writeFile(csv, '');
  const ndi = config.url.startsWith('ndi:') ? await startNdi(decodeURIComponent(new URL(config.url).pathname.slice(1))) : undefined;
  const raw=config.codec==='copy';
  let url=ndi ? "pipe:0" : config.url;
  if(url.startsWith('srt:')){const parsed=new URL(url);parsed.searchParams.set('latency',String(Math.max(Number(parsed.searchParams.get('latency'))||0,1000000)));url=parsed.toString();}
  // The data demuxer copies transport bytes without rebuilding SI tables or PIDs.
  const args = raw ? ['-hide_banner','-loglevel','warning','-rw_timeout','8000000','-f','data','-i',url,'-map','0:0','-c','copy','-f','data','pipe:1'] : recordingArgs({...config,url}, root, csv);
  const proc = spawn('ffmpeg', args, { windowsHide: true, env: { ...process.env, TZ: 'BRT3' }, stdio: ['pipe',raw?'pipe':'ignore','pipe'] });
  const item: Running = { root, ndi, process: proc, config, csv, started: Date.now(), lastProgress: Date.now(), error: '', seen: new Set(), stopping: false, prefix:basename(args.at(-1)!).split('%')[0] };
  running.set(config.id, item);
  if(ndi) {
    ndi.stdout.pipe(proc.stdin!);
    ndi.stderr.on('data', value => { item.error=(item.error+value.toString()).slice(-3000); });
    ndi.on('error', error => { item.error=error.message; proc.kill(); });
    ndi.on('close', () => proc.stdin?.end());
    proc.once('close', () => stopNdi(ndi));
  }
  if(raw) proc.stdout?.on('data',()=>{item.lastProgress=Date.now();lastErrors.delete(config.id);});
  if(raw) item.rawCompletion=captureTransport(proc.stdout!,date=>recordingRoot(config,date),config.blockMinutes??10,block=>{item.activeBlock=block;},async file=>{
    state.files.push({...file,id:randomUUID(),channelId:config.id,channel:config.name,programId:config.programId,codec:'copy',format:'ts'});await save();
  },`${channelSlug(config.name)}_`).catch(error=>{item.error=String(error);lastErrors.set(config.id,item.error);proc.kill();});
  proc.stdin?.on('error', () => {});
  proc.stderr?.on('data', chunk => { item.error = (item.error + chunk.toString()).slice(-3000); });
  proc.on('error', error => { item.error = error.message; lastErrors.set(config.id, item.error); });
  proc.on('close', () => {
    if(!item.stopping) void (item.rawCompletion??ingest(item)).then(save).catch(() => {});
    if (running.get(config.id) === item) running.delete(config.id);
    if (!item.stopping) { retryAfter.set(config.id, Date.now() + 5000); lastErrors.set(config.id, item.error || 'Gravador interrompido.'); audit(config.id,'failure',item.error); }
  });
  audit(config.id,'start',`${config.codec}/${config.format} ${config.width}x${config.height}`);
}
async function stop(id: string) {
  const item = running.get(id); if (!item) return;
  item.stopping = true;
  await new Promise<void>(resolveStop => {
    const timeout = setTimeout(() => { item.process.kill(); }, 10000);
    item.process.once('close', () => { clearTimeout(timeout); resolveStop(); });
    if(item.ndi) { stopNdi(item.ndi); item.process.stdin?.end(); } else item.process.stdin?.write('q\n');
  });
  if(item.rawCompletion)await item.rawCompletion;else await ingest(item); audit(id,'stop','Gravação encerrada');
}
function csvRows(text: string): string[][] {
  return text.split(/\r?\n/).filter(Boolean).map(line => {
    const fields: string[] = []; let field = '', quoted = false;
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (quoted && line[i+1] === '"') { field += '"'; i++; } else quoted = !quoted; } else if (c === ',' && !quoted) { fields.push(field); field = ''; } else field += c; }
    fields.push(field); return fields;
  });
}
export function resolveSegmentPath(config: ChannelConfig, filename: string) {
  const normalized = filename.replace(/\\/g, '/');
  const name = basename(normalized);
  if (/^[a-f0-9-]{36}_\d{9}\.(mp4|mkv)$/.test(name)) {
    if(isAbsolute(normalized)) {
      const candidate=resolve(normalized);
      const legacy=resolve(config.directory,`DC-Censura-${config.id}-${channelSlug(config.name)}`,'.pending',name);
      if(candidate===legacy)return candidate;
      const parent=basename(resolve(candidate,'../..'));
      if(!new RegExp(`^${channelSlug(config.name)}_(0[1-9]|1[0-2])\\d{4}$`).test(parent))return null;
      const expected=resolve(config.directory,parent,'.pending',name);
      return candidate===expected?candidate:null;
    }
    return join(recordingRoot(config), '.pending', name);
  }
  if (!/^\d{8}(?:\d{2}h\d{2}_\d{2}|_\d{2}h\d{2}(?:_\d+)?)\.(mp4|mkv)$/.test(name)) return null;
  return resolve(config.directory, `${channelSlug(config.name)}_${name.slice(2,8)}`, `${channelSlug(config.name)}_${name.slice(0,8)}`, name);
}
async function ingest(item: Running) {
  const text = await readFile(item.csv,'utf8').catch(() => '');
  for (const [filename, from, to] of csvRows(text)) {
    if (!filename || !Number.isFinite(Number(to)) || item.seen.has(filename)) continue;
    let path = resolveSegmentPath(item.config, filename);
    if (!path || state.files.some(file => file.path === path)) continue;
    const modern = /(?:^|[\\/])(\d{2})(\d{2})(\d{4})_(\d{2})h(\d{2})(?:_\d+)?\.(mp4|mkv)$/.exec(path);
    const match = modern ? [...modern.slice(0,6),'00',modern[6]] : /(?:^|[\\/])(\d{2})(\d{2})(\d{4})(\d{2})h(\d{2})_(\d{2})\.(mp4|mkv)$/.exec(path);
    item.seen.add(filename);
    try {
      const info = await stat(path); if (!info.isFile()) continue;
      const startTime = match ? Date.parse(`${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}-03:00`) : info.birthtimeMs;
      if (!match) {
        const date = new Date(startTime);
        const day = dayName(date);
        const folder = join(recordingRoot(item.config,date), `${channelSlug(item.config.name)}_${day}`);
        await mkdir(folder,{recursive:true});
        const destination = join(folder, recordingFileName(date,item.config.format));
        path = await finalizeRecording(path,destination);
      }
      state.files.push({ id: randomUUID(), path, channelId: item.config.id, channel: item.config.name, start: new Date(startTime).toISOString(), end: new Date(startTime + Math.max(0, Number(to)-Number(from)) * 1000).toISOString(), bytes: info.size, codec: item.config.codec, format: item.config.format });
      item.seen.add(filename);
    } catch { item.seen.delete(filename); }
  }
}
export function retentionCandidates(files: RecordingFile[], channel: ChannelConfig, now: number) { return files.filter(file => file.channelId === channel.id && Date.parse(file.end) < now - channel.retentionDays * 86400000).sort((a,b) => Date.parse(a.start)-Date.parse(b.start)); }
export function blockEnd(start: number, minutes: number, scheduleEnd?: string) {
  const duration=minutes*60000;
  const boundary=(Math.floor(start/duration)+1)*duration;
  return scheduleEnd ? Math.min(boundary,Date.parse(scheduleEnd)) : boundary;
}
async function updateActiveBlock(item: Running) {
  const folder=join(item.root ?? recordingRoot(item.config),'.pending');
  const names=(await readdir(folder)).filter(name=>item.prefix&&name.startsWith(item.prefix)&&!item.seen.has(name)).sort();
  const name=names.at(-1);
  if(!name){item.activeBlock=undefined;return;}
  const info=await stat(join(folder,name)).catch(()=>null);if(!info)return;
  const date=new Date(info.birthtimeMs);
  item.activeBlock={name:recordingFileName(date,item.config.format),start:date.toISOString(),end:new Date(blockEnd(info.birthtimeMs,item.config.blockMinutes??2,item.config.endAt)).toISOString(),bytes:info.size};
}
async function removeManaged(file: RecordingFile, reason: string) {
  if (protectedFiles.has(file.id)) return;
  // Only finalized files in our persistent manifest can be removed.
  try { await unlink(file.path); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  state.files = state.files.filter(f => f.id !== file.id); audit(file.channelId,'delete',`${reason}: ${file.path}`);
}
async function cleanup() {
  for (const config of state.channels) {
    if (!config.enabled) continue;
    for (const file of retentionCandidates(state.files, config, Date.now())) await removeManaged(file,'retenção');
    const fs = await statfs(config.directory).catch(() => null); if (!fs || !fs.blocks) continue;
    if (fs.bavail / fs.blocks > 0.10) continue;
    const volume = await stat(config.directory);
    const sameVolume = await Promise.all(state.files.map(async file => ({file, info:await stat(file.path).catch(()=>null)})));
    const oldest = sameVolume.filter(({info})=>info?.dev===volume.dev).map(({file})=>file).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    for (const file of oldest) {
      await removeManaged(file,'reserva de 10%');
      const current = await statfs(config.directory);
      if (current.bavail / current.blocks > 0.10) break;
    }
    const current = await statfs(config.directory);
    if (current.bavail / current.blocks <= 0.10) { await stop(config.id); lastErrors.set(config.id,'Disco com 10% ou menos livre; sem blocos antigos suficientes para liberar espaço.'); }
  }
}
async function tick() {
  if (busy || shuttingDown) return; busy = true;
  try {
    for (const item of running.values()) {
      await dailyFolders(item.config);
      if(!item.rawCompletion){
        await ingest(item); await updateActiveBlock(item);
        const block=item.activeBlock;
        const key=block ? `${block.start}:${block.bytes}` : undefined;
        if(key && key!==item.progressKey){item.progressKey=key;item.lastProgress=Date.now();lastErrors.delete(item.config.id);}
      }
      if(Date.now()-item.lastProgress>45000){
        const message='Sem novos dados na gravação por 45 segundos; reconectando a entrada.';
        audit(item.config.id,'reconnect',message);
        await stop(item.config.id);
        lastErrors.set(item.config.id,message);
        retryAfter.set(item.config.id,Date.now());
      }
    }
    await cleanup();
    for (const config of state.channels) {
      if(shuttingDown) break;
      const active = config.enabled && (!config.startAt || Date.now() >= Date.parse(config.startAt)) && (!config.endAt || Date.now() < Date.parse(config.endAt));
      if (!active) { await stop(config.id); continue; }
      const fs = await statfs(config.directory).catch(() => null);
      if (fs && fs.blocks && fs.bavail / fs.blocks <= 0.10) continue;
      if (!running.has(config.id) && Date.now() >= (retryAfter.get(config.id) ?? 0)) {
        try { await start(config); } catch (error) { lastErrors.set(config.id, String(error)); retryAfter.set(config.id, Date.now() + 5000); }
      }
    }
    await save();
  } finally { busy = false; }
}
export function configureChannel(input: ChannelConfig) {
  const task=configuring.then(()=>configureChannelInternal(input));
  configuring=task.then(()=>undefined,()=>undefined);return task;
}
async function configureChannelInternal(input: ChannelConfig) {
  await initRecordings(); const config = validateChannel(input);
  await stop(config.id);
  state.channels = [...state.channels.filter(c => c.id !== config.id), config];
  lastErrors.delete(config.id); retryAfter.delete(config.id); audit(config.id,'configure',`Retenção ${config.retentionDays} dias; reserva 10%`);
  await save(); await tick(); return status();
}
export function status() { return { serverTime: new Date().toISOString(), channels: state.channels.map(c => ({ ...c, activeBlock:running.get(c.id)?.activeBlock ?? null, running: running.has(c.id), error: lastErrors.get(c.id) ?? null, estimatedBlockMB: c.format==='ts'?null:(c.videoKbps+c.audioKbps)*(c.blockMinutes ?? 2)*60/8000, estimatedDayGB: c.format==='ts'?null:(c.videoKbps+c.audioKbps)*86400/8000000 })), files: state.files.map(({ path, ...file }) => file), audit: state.audit.slice(-100), reservePercent: 10 }; }
export function getRecording(id: string) { return state.files.find(file => file.id === id); }
export async function deleteRecordings(ids: string[]) {
  if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'))throw new Error('Selecione de 1 a 500 blocos.');
  const files=[...new Set(ids)].map(getRecording);
  if(files.some(file=>!file))throw new Error('Um bloco já foi removido. Atualize a lista.');
  if(files.some(file=>protectedFiles.has(file!.id)))throw new Error('Um bloco está sendo baixado ou exportado. Aguarde e tente novamente.');
  const deleted:string[]=[];
  try{for(const file of files){if(protectedFiles.has(file!.id))throw new Error('Bloco em uso. Aguarde e tente novamente.');await removeManaged(file!,'exclusão manual');deleted.push(file!.id);}}
  finally{await save();}
  return {deleted,...status()};
}
export async function shutdownRecordings() { shuttingDown=true; if (timer) clearInterval(timer); while(busy) await new Promise(done=>setTimeout(done,10)); for (const id of [...running.keys()]) await stop(id); await save(); }
