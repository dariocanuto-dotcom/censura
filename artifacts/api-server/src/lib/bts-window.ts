import type {Readable} from 'node:stream';
import {open,mkdir,statfs} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {packetSize} from './raw-recording.ts';
import {finalizeRecording} from './recording-file.ts';
export interface BtsSample {path:string;start:string;end:string;bytes:number;packetSize:number}
export function btsSamplePath(directory:string,date:Date){
 const parts=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date);
 const p=(key:string)=>parts.find(part=>part.type===key)!.value;
 const day=p('day')+p('month')+p('year');
 return join(directory,p('year'),p('month'),day,`freme${day}-${p('hour')}h${p('minute')}s${p('second')}.ts`);
}
export async function captureBtsWindows(input:Readable,directory:string,onComplete:(sample:BtsSample)=>Promise<void>,onReceived:()=>void=()=>{},onActive:(path:string|null)=>void=()=>{},now=Date.now,intervalMs=30000){
 let pending=Buffer.alloc(0),size:number|null=null,nextStart:number|undefined;
 let active:{file:Awaited<ReturnType<typeof open>>;temporary:string;destination:string;start:number;end:number;bytes:number;lastData:number}|undefined;
 let timer:ReturnType<typeof setTimeout>|undefined,queue=Promise.resolve();
 const enqueue=(fn:()=>Promise<void>)=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 const close=async()=>{
  if(!active)return;const sample=active;active=undefined;if(timer)clearTimeout(timer);onActive(null);
  try{await sample.file.sync();}finally{await sample.file.close();}
  // An interrupted window stays visibly partial; never advertise it as a full five seconds.
  if(now()<sample.end||sample.bytes===0||sample.lastData<sample.end-1500)return;
  const path=await finalizeRecording(sample.temporary,sample.destination);
  await onComplete({path,start:new Date(sample.start).toISOString(),end:new Date(sample.end).toISOString(),bytes:sample.bytes,packetSize:188});
 };
 try{
  for await(const value of input){
   onReceived();const chunk=Buffer.from(value as Buffer);
   await enqueue(async()=>{
    pending=Buffer.concat([pending,chunk]);
    if(!size){size=packetSize(pending);if(!size){if(pending.length>65536)throw new Error('Não foi identificado BTS/TS original de 188, 192 ou 204 bytes.');return;}}
    const length=Math.floor(pending.length/size)*size;if(!length)return;
    const original=pending.subarray(0,length);pending=Buffer.from(pending.subarray(length));
    const data=size===188?original:Buffer.concat(Array.from({length:length/size},(_,index)=>original.subarray(index*size!+(size===192?4:0),index*size!+(size===192?4:0)+188)));
    const time=now();nextStart??=Math.ceil(time/intervalMs)*intervalMs;
    if(active&&time>=active.end)await close();
    if(!active&&time>=nextStart){
     const boundary=nextStart;nextStart=(Math.floor(time/intervalMs)+1)*intervalMs;
     if(time-boundary>1000)return;
     const fs=await statfs(directory);if(fs.blocks&&fs.bavail/fs.blocks<=0.1)throw new Error('Captura BTS suspensa: o HD tem 10% ou menos de espaço livre.');
     const destination=btsSamplePath(directory,new Date(boundary));
     await mkdir(dirname(destination),{recursive:true});
     const temporary=destination+'.'+randomUUID().slice(0,8)+'.partial';
     const file=await open(temporary,'wx');
     active={file,temporary,destination,start:time,end:time+5000,bytes:0,lastData:time};onActive(destination);
     timer=setTimeout(()=>void enqueue(close).catch(error=>input.destroy(error)),5000);timer.unref();
    }
    if(active){let offset=0;while(offset<data.length){const result=await active.file.write(data,offset,data.length-offset);if(!result.bytesWritten)throw new Error('Falha ao escrever a amostra BTS.');offset+=result.bytesWritten;}active.bytes+=data.length;active.lastData=time;}
   });
  }
 }finally{if(timer)clearTimeout(timer);await enqueue(close);}
}

export function isVideoSampleTime(time:number){return Math.floor(time/60000)%4===0;}
