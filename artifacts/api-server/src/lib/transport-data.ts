import {Transform} from 'node:stream';
import {packetSize} from './raw-recording.ts';

// Preserve SI, captions and private data byte for byte. PAT/PMT identify the
// elementary audio/video PIDs to omit; this file is a data companion, not a movie.
export class TransportData extends Transform {
 private pending=Buffer.alloc(0);private width:number|null=null;
 private pmts=new Set<number>();private media=new Map<number,Set<number>>();
 private av=new Set<number>();private startup:Buffer[]=[];private startupBytes=0;private ready=false;
 private sections=new Map<number,Buffer>();private counters=new Map<number,number>();
 private parse(pid:number,section:Buffer){
  if(pid===0&&section[0]===0){for(let i=8;i+4<=section.length-4;i+=4)if(section.readUInt16BE(i)!==0)this.pmts.add(((section[i+2]&31)<<8)|section[i+3]);}
  if(this.pmts.has(pid)&&section[0]===2){
   const media=new Set<number>();let i=12+(((section[10]&15)<<8)|section[11]);
   while(i+5<=section.length-4){const type=section[i],id=((section[i+1]&31)<<8)|section[i+2],length=((section[i+3]&15)<<8)|section[i+4];
    let av=[1,2,3,4,15,16,17,27,36,0x42,0x81,0x87].includes(type);
    if(type===6)for(let j=i+5;j+2<=i+5+length;){if([0x6a,0x7a,0x7b,0x7c].includes(section[j]))av=true;j+=2+section[j+1];}
    if(av)media.add(id);i+=5+length;
   }this.media.set(pid,media);this.av=new Set([...this.media.values()].flatMap(ids=>[...ids]));
  }
 }
 private append(pid:number,data:Buffer){
  let buffer=Buffer.concat([this.sections.get(pid)??Buffer.alloc(0),data]);
  while(buffer.length>=3&&buffer[0]!==255){const length=3+(((buffer[1]&15)<<8)|buffer[2]);if(length>4096){buffer=Buffer.alloc(0);break;}if(buffer.length<length)break;this.parse(pid,buffer.subarray(0,length));buffer=buffer.subarray(length);}
  this.sections.set(pid,buffer[0]===255?Buffer.alloc(0):Buffer.from(buffer));
 }
 _transform(chunk:Buffer,_encoding:BufferEncoding,callback:(error?:Error|null)=>void){try{
  this.pending=Buffer.concat([this.pending,chunk]);this.width??=packetSize(this.pending);
  if(!this.width){if(this.pending.length>65536)throw new Error('Transporte original inválido.');callback();return;}
  const length=Math.floor(this.pending.length/this.width)*this.width,output:Buffer[]=[];
  for(let i=0;i<length;i+=this.width){const start=i+(this.width===192?4:0),p=this.pending.subarray(start,start+188);if(p[0]!==71)throw new Error('Perda de sincronismo no transporte.');const pid=((p[1]&31)<<8)|p[2];
   if((pid===0||this.pmts.has(pid))&&(p[3]&16)){
    const cc=p[3]&15,previous=this.counters.get(pid);if(previous!==undefined&&cc!==((previous+1)&15))this.sections.delete(pid);this.counters.set(pid,cc);
    let offset=4;if(p[3]&32)offset+=1+p[4];if(offset<188){if(p[1]&64){const pointer=p[offset++];if(pointer&&this.sections.get(pid)?.length)this.append(pid,p.subarray(offset,offset+pointer));offset+=pointer;this.sections.delete(pid);}if(offset<188)this.append(pid,p.subarray(offset));}
   }
   if(!this.ready){
    this.startup.push(Buffer.from(p));this.startupBytes+=188;
    if(this.pmts.size&&[...this.pmts].every(id=>this.media.has(id))){this.ready=true;for(const saved of this.startup){const id=((saved[1]&31)<<8)|saved[2];if(id!==8191&&!this.av.has(id))output.push(saved);}this.startup=[];}
    else if(this.startupBytes>8*1024*1024)throw new Error('PAT/PMT ausentes: não é possível separar os dados com segurança.');
    continue;
   }
   if(pid!==8191&&!this.av.has(pid))output.push(p);
  }
  if(output.length)this.push(Buffer.concat(output));this.pending=Buffer.from(this.pending.subarray(length));callback();
 }catch(error){callback(error as Error);}}
 _flush(callback:(error?:Error|null)=>void){callback(this.startupBytes&&!this.ready?new Error('Amostra sem PAT/PMT completas; original preservado.'):undefined);}
}
