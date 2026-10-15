import {spawn,type ChildProcess} from 'node:child_process';
import {mkdir,readFile,writeFile,rename,open,unlink,statfs} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initRecordings,status} from './recordings.ts';
import {captureBtsWindows,type BtsSample} from './bts-window.ts';
import {videoEncoder,encoderOptions,hardwareFailure} from './video-acceleration.ts';
const root=resolve('.runtime/recording-service/bts-samples');
let config={enabled:false,directory:''};
let lastSample:BtsSample|null=null,completed=0,error:string|null=null,retryAt=0,currentSample:string|null=null;
let run:{process:ChildProcess;done:Promise<void>;signature:string;stopping:boolean;receivedAt:number}|undefined;
let initialization:Promise<void>|undefined,timer:ReturnType<typeof setInterval>|undefined,busy=false,shutdown=false;
let saving=Promise.resolve(),configuring=Promise.resolve();
export function separateSampleFolder(directory:string,recordingDirectory?:string){
 if(!isAbsolute(directory))throw new Error('Informe uma pasta absoluta para as amostras BTS.');
 if(recordingDirectory){const a=resolve(directory),b=resolve(recordingDirectory),inside=(parent:string,child:string)=>{const path=relative(parent,child);return !path||(!path.startsWith('..'+sep)&&path!=='..'&&!isAbsolute(path));};if(inside(a,b)||inside(b,a))throw new Error('Escolha uma pasta separada da gravação contínua, por exemplo uma pasta ao lado dela.');}
 return resolve(directory);
}
function save(){saving=saving.catch(()=>{}).then(async()=>{await mkdir(root,{recursive:true});await writeFile(join(root,'state.json.tmp'),JSON.stringify({config,lastSample,completed}),{mode:0o600});await rename(join(root,'state.json.tmp'),join(root,'state.json'));});return saving;}
export function btsSamplesStatus(){const channel=status().channels[0];return {config,source:channel?.name??null,sourceSupported:Boolean(channel&&/^(srt|udp|rtp):/.test(channel.url)),running:Boolean(run),capturing:Boolean(currentSample),currentSample,lastSample,completed,error,intervalSeconds:30,durationSeconds:5,videoKbps:200,audioKbps:64,format:'mpegts'};}
async function stop(){const worker=run;if(!worker)return;worker.stopping=true;worker.process.stdin?.write('q\n');const force=setTimeout(()=>worker.process.kill('SIGKILL'),2500);try{await worker.done;}finally{clearTimeout(force);if(run===worker)run=undefined;currentSample=null;}}
async function tick(){
 if(busy||shutdown)return;busy=true;
 try{
  const channel=status().channels[0];
  if(!config.enabled){await stop();return;}
  if(!channel||!btsSamplesStatus().sourceSupported){await stop();error='Amostras BTS originais exigem uma entrada SRT, UDP ou RTP configurada em Gravar.';return;}
  separateSampleFolder(config.directory,channel.directory);
  const signature=JSON.stringify([channel.url,config.directory]);
  if(run&&(run.signature!==signature||Date.now()-run.receivedAt>15000)){await stop();retryAt=Date.now()+5000;}
  if(run||Date.now()<retryAt)return;
  await mkdir(config.directory,{recursive:true});const fs=await statfs(config.directory);
  if(fs.blocks&&fs.bavail/fs.blocks<=0.1){error='Captura BTS suspensa: o HD tem 10% ou menos de espaço livre.';retryAt=Date.now()+30000;return;}
  const url=new URL(channel.url);if(url.protocol==='srt:')url.searchParams.set('latency',String(Math.max(Number(url.searchParams.get('latency'))||0,1000000)));if(url.protocol==='udp:')url.searchParams.set('reuse','1');
  const encoder=await videoEncoder('h264');
  const program=channel.programId?`p:${channel.programId}:`:'';
  const process=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-rw_timeout','8000000','-i',url.toString(),'-map',`0:${program}v:0`,'-map',`0:${program}a:0?`,'-vf','scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1',...encoderOptions('h264',encoder),'-b:v','200k','-maxrate','200k','-bufsize','400k','-r','25','-g','12','-force_key_frames','expr:gte(t,n_forced*0.5)','-c:a','aac','-b:a','64k','-ac','2','-ar','48000','-mpegts_flags','+resend_headers','-f','mpegts','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stderr='';process.stdin?.on('error',()=>{});process.stderr?.on('data',value=>{stderr=(stderr+value.toString()).slice(-1000);hardwareFailure('h264',stderr);});process.on('error',()=>{error='Não foi possível iniciar o receptor de amostras BTS.';});
  const worker={process,signature,stopping:false,receivedAt:Date.now(),done:Promise.resolve()};run=worker;
  worker.done=captureBtsWindows(process.stdout!,config.directory,async sample=>{lastSample=sample;completed++;error=null;await save();},()=>{worker.receivedAt=Date.now();},path=>{currentSample=path;})
   .catch(e=>{if(!worker.stopping)error=e instanceof Error?e.message:'Falha ao salvar BTS.';process.kill('SIGTERM');})
   .finally(async()=>{if(!worker.stopping){error??=stderr?'A entrada BTS foi interrompida; tentando reconectar.':'O receptor BTS encerrou; tentando reconectar.';retryAt=Date.now()+5000;}if(run===worker)run=undefined;currentSample=null;await save();}).catch(e=>{error=e instanceof Error?e.message:'Falha ao persistir o estado BTS.';});
 }catch(e){await stop();error=e instanceof Error?e.message:'Falha nas amostras BTS.';retryAt=Date.now()+5000;}finally{busy=false;}
}
export function initBtsSamples(){return initialization??=initialize().catch(e=>{initialization=undefined;throw e;});}
async function initialize(){await initRecordings();try{const saved=JSON.parse(await readFile(join(root,'state.json'),'utf8'));config=saved.config;lastSample=saved.lastSample;completed=saved.completed??0;}catch(e:any){if(e.code!=='ENOENT')throw e;}
 if(!config.directory){const directory=status().channels[0]?.directory;config.directory=directory?resolve(dirname(directory),'amostras_bts'):resolve('.runtime/amostras_bts');}
 await save();timer=setInterval(()=>void tick().catch(e=>{error=e instanceof Error?e.message:'Falha no serviço BTS.';}),1000);timer.unref();}
export function configureBtsSamples(input:{enabled:boolean;directory:string}){
 const task=configuring.then(async()=>{await initBtsSamples();if(typeof input.enabled!=='boolean'||typeof input.directory!=='string')throw new Error('Configuração BTS inválida.');const directory=separateSampleFolder(input.directory,status().channels[0]?.directory);if(input.enabled){if(!btsSamplesStatus().sourceSupported)throw new Error('A entrada deve fornecer BTS original por SRT, UDP ou RTP.');await mkdir(directory,{recursive:true});const probe=join(directory,'.bts-write-'+randomUUID());const file=await open(probe,'wx');await file.close();await unlink(probe);}
 while(busy)await new Promise(r=>setTimeout(r,10));busy=true;try{await stop();config={enabled:input.enabled,directory};error=null;retryAt=0;await save();}finally{busy=false;}await tick();return btsSamplesStatus();});configuring=task.then(()=>{},()=>{});return task;
}
export async function stopBtsSamples(){shutdown=true;if(timer)clearInterval(timer);while(busy)await new Promise(r=>setTimeout(r,10));await stop();await saving;}
