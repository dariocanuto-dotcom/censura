import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { packetSize } from './raw-recording';
import { createEitCollector } from '../routes/srt';
export async function recordingInfo(path:string) {
  const probe:any=await new Promise((resolve,reject)=>{
    const process=spawn('ffprobe',['-v','quiet','-probesize','10000000','-analyzeduration','5000000','-show_programs','-show_streams','-show_format','-of','json',path],{windowsHide:true});
    let text='';const timeout=setTimeout(()=>{process.kill();reject(new Error('Tempo limite ao analisar o bloco'));},20000);
    process.stdout.on('data',chunk=>text+=chunk);process.on('error',reject);process.on('close',()=>{clearTimeout(timeout);try{resolve(JSON.parse(text));}catch(error){reject(error);}});
  });
  const psi=new Set([0,1,16,17,18,20,36,41,0x1fc8,...(probe.programs??[]).map((p:any)=>p.pmt_pid)]);
  const pids=new Map<number,number>(),tables=new Map<number,Set<number>>(),epg=createEitCollector();
  let pending=Buffer.alloc(0),width:number|null=null;
  for await(const chunk of createReadStream(path)) {
    pending=Buffer.concat([pending,chunk]);if(!width){width=packetSize(pending);if(!width){if(pending.length>65536)break;continue;}}
    const length=Math.floor(pending.length/width)*width;
    for(let position=0;position<length;position+=width){
      const packet=pending.subarray(position+(width===192?4:0),position+(width===192?4:0)+188);
      if(packet[0]!==0x47)continue;
      const pid=((packet[1]&31)<<8)|packet[2];pids.set(pid,(pids.get(pid)??0)+1);
      if(!psi.has(pid)||(packet[3]&0x10)===0)continue;
      let offset=4;if(packet[3]&0x20)offset+=1+packet[4];if(offset>=188)continue;
      const start=Boolean(packet[1]&0x40);
      if(start){const pointer=packet[offset];if(pid===18&&pointer)epg.push(packet.subarray(offset+1,offset+1+pointer));offset+=1+pointer;if(offset>=188)continue;const ids=tables.get(pid)??new Set<number>();ids.add(packet[offset]);tables.set(pid,ids);}
      if(pid===18)epg.push(packet.subarray(offset));
    }
    pending=Buffer.from(pending.subarray(length));
  }
  return {transport:'TS/BTS original',programs:probe.programs??[],streams:probe.streams??[],format:probe.format,pids:[...pids].sort((a,b)=>a[0]-b[0]).map(([pid,packets])=>({pid,hex:`0x${pid.toString(16)}`,packets,tableIds:[...(tables.get(pid)??[])]})),epg:epg.result(),closedCaption:(probe.streams??[]).filter((s:any)=>s.codec_name==='arib_caption'||s.codec_type==='subtitle')};
}
