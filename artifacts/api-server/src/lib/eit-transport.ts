import {packetSize} from './raw-recording.ts';
export function eitTransport(onSection:(section:Buffer)=>void,onEitPacket:()=>void=()=>{}){
 let pending=Buffer.alloc(0),section=Buffer.alloc(0),width:number|null=null,lastCc:number|undefined;
 const append=(bytes:Buffer)=>{section=Buffer.concat([section,bytes]);while(section.length>=3&&section[0]!==255){const length=3+(((section[1]&15)<<8)|section[2]);if(length>4096||length<7){section=Buffer.alloc(0);break;}if(section.length<length)break;if(section[0]>=0x4e&&section[0]<=0x6f)onSection(section.subarray(0,length));section=section.subarray(length);}if(section[0]===255)section=Buffer.alloc(0);};
 return (chunk:Buffer)=>{pending=Buffer.concat([pending,chunk]);width??=packetSize(pending);if(!width){if(pending.length>65536)pending=Buffer.alloc(0);return;}const length=Math.floor(pending.length/width)*width;
 for(let i=0;i<length;i+=width){const start=i+(width===192?4:0),p=pending.subarray(start,start+188);if(p[0]!==71||(((p[1]&31)<<8)|p[2])!==18||!(p[3]&16))continue;onEitPacket();const cc=p[3]&15;if(lastCc!==undefined&&cc!==((lastCc+1)&15))section=Buffer.alloc(0);lastCc=cc;let offset=4;if(p[3]&32)offset+=1+p[4];if(offset>=188)continue;if(p[1]&64){const pointer=p[offset++];if(pointer&&section.length)append(p.subarray(offset,offset+pointer));offset+=pointer;section=Buffer.alloc(0);}if(offset<188)append(p.subarray(offset));}
 pending=Buffer.from(pending.subarray(length));};
}
