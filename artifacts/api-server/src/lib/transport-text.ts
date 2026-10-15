import {createHash} from 'node:crypto';
const names:Record<number,string>={0:'PAT',1:'CAT',2:'PMT',0x40:'NIT',0x41:'NIT',0x42:'SDT',0x46:'SDT',0x4a:'BAT',0x70:'TDT',0x73:'TOT'};
/** UTF-8 JSON lines: unique original table sections, caption packets and PID counts. */
export class TransportText {
 private pmts=new Set<number>();private privatePids=new Set<number>([278]);
 private pending=new Map<number,Buffer>();private counts=new Map<number,number>();private seen=new Set<string>();
 header(time:number){return JSON.stringify({tipo:'inicio',horario:new Date(time).toISOString(),formato:'Dados da transmissão em texto UTF-8',conteudo:'Tabelas originais em hexadecimal, pacotes de CC/dados e contagem de PIDs. Sem vídeo/áudio.'})+'\n';}
 private section(pid:number,section:Buffer,time:number){
  const id=section[0];
  if(id===0&&pid===0)for(let i=8;i+4<=section.length-4;i+=4)if(section.readUInt16BE(i))this.pmts.add(((section[i+2]&31)<<8)|section[i+3]);
  if(id===2&&this.pmts.has(pid)){let i=12+(((section[10]&15)<<8)|section[11]);while(i+5<=section.length-4){const length=((section[i+3]&15)<<8)|section[i+4];if(section[i]===6)this.privatePids.add(((section[i+1]&31)<<8)|section[i+2]);i+=5+length;}}
  const key=pid+':'+createHash('sha256').update(section).digest('hex');if(this.seen.has(key))return '';
  if(this.seen.size>=16384)this.seen.clear();this.seen.add(key);
  const table=names[id]??(id>=0x4e&&id<=0x6f?'EIT':'Tabela privada');
  return JSON.stringify({tipo:'tabela',horario:new Date(time).toISOString(),tabela:table,pid,tableId:'0x'+id.toString(16).padStart(2,'0'),...(section[1]&128?{identificador:section.readUInt16BE(3),versao:(section[5]>>1)&31,secao:section[6],ultimaSecao:section[7]}:{}),dadosHex:section.toString('hex')})+'\n';
 }
 private append(pid:number,bytes:Buffer,time:number){let out='',data=Buffer.concat([this.pending.get(pid)??Buffer.alloc(0),bytes]);while(data.length>=3&&data[0]!==255){const length=3+(((data[1]&15)<<8)|data[2]);if(length>4096){data=Buffer.alloc(0);break;}if(data.length<length)break;out+=this.section(pid,data.subarray(0,length),time);data=data.subarray(length);}this.pending.set(pid,data[0]===255?Buffer.alloc(0):Buffer.from(data));return out;}
 push(data:Buffer,width:number,time:number){let out='';for(let i=0;i+width<=data.length;i+=width){const offset=i+(width===192?4:0),p=data.subarray(offset,offset+188);if(p[0]!==71)continue;const pid=((p[1]&31)<<8)|p[2];this.counts.set(pid,(this.counts.get(pid)??0)+1);
  if(pid<48||this.pmts.has(pid)){
   if(!(p[3]&16))continue;let pos=4;if(p[3]&32)pos+=1+p[4];if(pos>=188)continue;
   if(p[1]&64){const pointer=p[pos++];if(pointer&&this.pending.get(pid)?.length)out+=this.append(pid,p.subarray(pos,pos+pointer),time);pos+=pointer;this.pending.delete(pid);}
   if(pos<188)out+=this.append(pid,p.subarray(pos),time);
  }else out+=JSON.stringify({tipo:this.privatePids.has(pid)?'CC/dados privados':'dados privados',horario:new Date(time).toISOString(),pid,pacoteHex:p.toString('hex')})+'\n';
 }return out;}
 finish(time:number){return JSON.stringify({tipo:'resumo',horario:new Date(time).toISOString(),pids:[...this.counts].sort((a,b)=>a[0]-b[0]).map(([pid,pacotes])=>({pid,pacotes})),observacao:'Repetições idênticas das tabelas são omitidas; o conteúdo original de cada seção distinta está em dadosHex.'})+'\n';}
}
