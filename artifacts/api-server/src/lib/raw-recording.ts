import { createWriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
export function packetSize(buffer:Buffer) {
  for(const size of [188,204,192]) for(const offset of [0,4]) {
    if(buffer.length>size*4+offset&&[0,1,2,3,4].every(i=>buffer[i*size+offset]===0x47)) return size;
  }
  return null;
}
export async function captureTransport(input:Readable,root:string,minutes:number,onActive:(block:{name:string;start:string;end:string;bytes:number}|undefined)=>void,onComplete:(file:{path:string;start:string;end:string;bytes:number})=>Promise<void>,prefix='',now=Date.now) {
  let pending=Buffer.alloc(0),size:number|null=null;
  let output:ReturnType<typeof createWriteStream>|undefined;
  let filePath='',finalPath='',start=0,end=0,bytes=0;
  const close=async()=>{
    if(!output)return;
    const finished=once(output,'finish');output.end();await finished;
    await rename(filePath,finalPath);
    await onComplete({path:finalPath,start:new Date(start).toISOString(),end:new Date(now()).toISOString(),bytes});
    output=undefined;onActive(undefined);
  };
  const open=async()=>{
    start=now();end=(Math.floor(start/(minutes*60000))+1)*minutes*60000;bytes=0;
    const parts=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hourCycle:'h23',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(start);
    const p=(key:string)=>parts.find(x=>x.type===key)!.value;
    const day=p('day')+p('month')+p('year');
    const folder=join(root,`${prefix}${day}`);await mkdir(folder,{recursive:true});
    const name=`${day}${p('hour')}h${p('minute')}_${p('second')}_${randomUUID().slice(0,8)}.ts`;
    finalPath=join(folder,name);filePath=finalPath+'.partial';output=createWriteStream(filePath,{flags:'wx'});
    output.on('error',()=>{});
  };
  try {
    for await(const chunk of input){
      pending=Buffer.concat([pending,chunk as Buffer]);
      if(!size){size=packetSize(pending);if(!size){if(pending.length>65536)throw new Error('Não foi identificado transporte TS/BTS de 188, 192 ou 204 bytes.');continue;}}
      const length=Math.floor(pending.length/size)*size;if(!length)continue;
      if(output&&now()>=end)await close();if(!output)await open();
      const data=pending.subarray(0,length);pending=Buffer.from(pending.subarray(length));
      if(!output!.write(data))await once(output!,'drain');bytes+=data.length;
      onActive({name:finalPath.split(/[\\/]/).at(-1)!,start:new Date(start).toISOString(),end:new Date(end).toISOString(),bytes});
    }
    if(pending.length&&output){if(!output.write(pending))await once(output,'drain');bytes+=pending.length;}
  } finally {await close();}
}
