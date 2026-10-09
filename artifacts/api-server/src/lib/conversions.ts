import { spawn } from 'node:child_process';
import { mkdir,statfs } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {getRecording,protectRecordings} from './recordings';
export const exportFormats=[
  {id:'mxf',label:'MXF',extension:'mxf'}, {id:'mov',label:'MOV',extension:'mov'},
  {id:'mp4',label:'MP4',extension:'mp4'}, {id:'avi',label:'AVI',extension:'avi'},
  {id:'mkv',label:'MKV',extension:'mkv'}, {id:'flv',label:'FLV',extension:'flv'},
  {id:'3gp',label:'3GP',extension:'3gp'}, {id:'ps',label:'MPEG-PS',extension:'mpg'},
  {id:'ts',label:'MPEG-TS',extension:'ts'}, {id:'asf',label:'ASF / WMV',extension:'wmv'},
  {id:'dv',label:'DV',extension:'dv'}, {id:'gxf',label:'GXF',extension:'gxf'},
];
export const exportProfiles=[
  {id:'auto',label:'Automático',formats:exportFormats.map(f=>f.id)},
  {id:'h264',label:'H.264',formats:['mov','mp4','mkv','ts','flv']},
  {id:'h265',label:'H.265 / HEVC',formats:['mov','mp4','mkv','ts']},
  {id:'mpeg2',label:'MPEG-2',formats:['mxf','mov','mkv','ps','ts','gxf']},
  {id:'xdcamhd',label:'XDCAM HD422 · 50 Mb/s',formats:['mxf']},
  {id:'xavc',label:'XAVC Intra Class 100',formats:['mxf']},
];
export function conversionArgs(input:string,output:string,format:string,profile='auto',programId?:number) {
  const spec=exportFormats.find(f=>f.id===format),preset=exportProfiles.find(p=>p.id===profile);
  if(!spec||!preset||!preset.formats.includes(format))throw new Error('Combinação de formato e codec não suportada.');
  const map=programId===undefined?'0':`0:p:${programId}`;
  const single=['flv','3gp','asf','dv','gxf','ps'].includes(format);
  const args=['-hide_banner','-loglevel','warning','-nostdin','-y','-i',input,'-map',`${map}:v:0`,'-map',single?`${map}:a:0?`:`${map}:a?`,'-threads','2'];
  const hd='scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1';
  const sd='scale=720:576:force_original_aspect_ratio=decrease,pad=720:576:(ow-iw)/2:(oh-ih)/2,setsar=1';
  let encoder=profile==='h265'?'libx265':profile==='mpeg2'||profile==='xdcamhd'?'mpeg2video':'libx264';
  if(profile==='xavc')args.push('-vf',hd,'-r','30000/1001','-c:v','libx264','-preset','fast','-pix_fmt','yuv422p10le','-avcintra-class','100','-x264-params','avcintra-flavor=sony','-c:a','pcm_s24le','-ar','48000');
  else if(profile==='xdcamhd'||(format==='mxf'&&profile==='auto'))args.push('-vf',`${hd},fps=60000/1001,tinterlace=interleave_top`,'-r','30000/1001','-c:v','mpeg2video','-pix_fmt','yuv422p','-b:v','50M','-minrate','50M','-maxrate','50M','-bufsize','17825792','-g','15','-bf','2','-flags','+ildct+ilme','-field_order','tt','-c:a','pcm_s16le','-ar','48000');
  else if(format==='dv')args.push('-vf',sd,'-r','25','-c:v','dvvideo','-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','48000','-ac','2');
  else if(format==='gxf')args.push('-map',`${map}:a:0?`,'-filter:a:0','aformat=channel_layouts=stereo,pan=mono|c0=FL','-filter:a:1','aformat=channel_layouts=stereo,pan=mono|c0=FR','-vf',sd,'-r','25','-c:v','mpeg2video','-pix_fmt','yuv422p','-b:v','30M','-flags','+ildct+ilme','-field_order','tt','-c:a','pcm_s16le','-ar','48000');
  else if(format==='ps')args.push('-vf',sd,'-r','25','-c:v','mpeg2video','-pix_fmt','yuv420p','-b:v','6M','-c:a','mp2','-b:a','192k','-ar','48000','-ac','2');
  else if(format==='3gp')args.push('-vf','scale=352:288:force_original_aspect_ratio=decrease,pad=352:288:(ow-iw)/2:(oh-ih)/2,setsar=1','-r','25','-c:v','h263','-b:v','400k','-c:a','aac','-b:a','64k','-ar','44100','-ac','2');
  else if(format==='asf')args.push('-vf','scale=640:360,setsar=1','-c:v','wmv2','-b:v','1500k','-c:a','wmav2','-b:a','128k','-ar','44100','-ac','2');
  else if(format==='avi')args.push('-c:v','mpeg4','-q:v','4','-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','48000');
  else if(format==='flv'&&profile==='auto')args.push('-vf','scale=640:360,setsar=1','-c:v','flv','-b:v','1500k','-c:a','libmp3lame','-b:a','128k','-ar','44100','-ac','2');
  else {
    args.push('-vf',"scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",'-c:v',encoder,'-pix_fmt','yuv420p');
    if(encoder==='mpeg2video')args.push('-b:v','8M');else args.push('-preset','veryfast','-crf','23');
    args.push('-c:a',format==='mxf'?'pcm_s16le':'aac','-ar','48000');
  }
  if(['mp4','mov','3gp'].includes(format))args.push('-movflags','+faststart');
  if(format==='mp4'&&encoder==='libx265')args.push('-tag:v','hvc1');
  args.push('-f',format==='ps'?'mpeg':format==='ts'?'mpegts':format==='mkv'?'matroska':format,output);return args;
}
interface Job {id:string;fileId:string;format:string;profile:string;status:'converting'|'ready'|'error';percent:number;error?:string;path:string;created:number}
const jobs=new Map<string,Job>();
const children=new Map<string,ReturnType<typeof spawn>>();
let starting=Promise.resolve();
export function conversionJob(id:string){return jobs.get(id);}
export function startConversion(fileId:string,format:string,profile:string,programId?:number) {
  const task=starting.then(()=>startConversionInternal(fileId,format,profile,programId));starting=task.then(()=>undefined,()=>undefined);return task;
}
async function defaultProgram(path:string):Promise<number|undefined>{
  return new Promise((done,fail)=>{
    const probe=spawn('ffprobe',['-v','quiet','-show_programs','-of','json',path],{windowsHide:true});let text='';
    const timer=setTimeout(()=>{probe.kill();fail(new Error('Tempo limite ao identificar o programa do bloco.'));},15000);
    probe.stdout.on('data',chunk=>text+=chunk);probe.on('error',error=>{clearTimeout(timer);fail(error);});
    probe.on('close',()=>{clearTimeout(timer);try{const data=JSON.parse(text);done(data.programs?.find((p:any)=>p.streams?.some((s:any)=>s.codec_type==='video'))?.program_id);}catch(error){fail(error);}});
  });
}
async function startConversionInternal(fileId:string,format:string,profile:string,programId?:number) {
  if(programId!==undefined&&(!Number.isInteger(programId)||programId<0||programId>65535))throw new Error('Programa inválido.');
  const file=getRecording(fileId);if(!file)throw new Error('Bloco não encontrado.');
  if([...jobs.values()].some(j=>j.status==='converting'))throw new Error('Aguarde a exportação em andamento.');
  const spec=exportFormats.find(f=>f.id===format);if(!spec)throw new Error('Formato inválido.');
  const id=randomUUID(),folder=resolve('.runtime/export-jobs',id);await mkdir(folder,{recursive:true});
  const path=join(folder,`censura-${id.slice(0,8)}.${spec.extension}`);
  const selectedProgram=programId??file.programId??await defaultProgram(file.path);
  const args=conversionArgs(file.path,path,format,profile,selectedProgram);
  const free=await statfs(folder);if(free.blocks&&free.bavail/free.blocks<=0.10)throw new Error('Disco de exportação com 10% ou menos livre.');
  const job:Job={id,fileId,format,profile,status:'converting',percent:0,path,created:Date.now()};jobs.set(id,job);
  const release=protectRecordings([file.id]);
  args.splice(args.length-1,0,'-progress','pipe:1','-nostats');
  const process=spawn('ffmpeg',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  children.set(id,process);
  let log='',progress='';
  const duration=Math.max(1,(Date.parse(file.end)-Date.parse(file.start))/1000);
  process.stderr.on('data',chunk=>log=(log+chunk.toString()).slice(-3000));
  process.stdout.on('data',chunk=>{progress+=chunk.toString();const lines=progress.split(/\r?\n/);progress=lines.pop()??'';for(const line of lines)if(line.startsWith('out_time_us='))job.percent=Math.min(99,Math.max(0,Number(line.slice(12))/1000000/duration*100));});
  const timer=setInterval(()=>{void statfs(folder).then(f=>{if(f.blocks&&f.bavail/f.blocks<=0.10){job.error='Exportação interrompida para reservar 10% do disco.';process.kill();}}).catch(()=>{});},2000);timer.unref();
  process.on('error',error=>{job.error=error.message;job.status='error';});
  process.on('close',code=>{children.delete(id);clearInterval(timer);release();job.status=code===0&&!job.error?'ready':'error';if(job.status==='ready')job.percent=100;else job.error??=log.split(/\r?\n/).filter(l=>/error|failed|invalid|unsupported/i.test(l)).slice(-3).join(' ').slice(0,600)||'Falha na conversão.';});
  return {id,status:job.status};
}
export async function shutdownConversions(){await starting;await Promise.all([...children.values()].map(process=>new Promise<void>(done=>{process.once('close',()=>done());process.kill();})));}
