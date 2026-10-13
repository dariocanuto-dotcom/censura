import {execFile} from 'node:child_process';
export type VideoCodec='h264'|'h265';
const cache=new Map<VideoCodec,{available:boolean;until:number}>();
const pending=new Map<VideoCodec,Promise<boolean>>();
export function hardwareEncoder(codec:VideoCodec){return codec==='h265'?'hevc_nvenc':'h264_nvenc';}
export function hardwareFailure(codec:VideoCodec,error:string){
 if(/cannot load libcuda|no capable devices|openencodesession.*failed|nvenc.*(?:error|failed)|initialize.*encoder|CUDA_ERROR|out of memory|driver.*(?:require|unsupported)/i.test(error))cache.set(codec,{available:false,until:Date.now()+300000});
}
export async function videoEncoder(codec:VideoCodec){
 const software=codec==='h265'?'libx265':'libx264';
 if(process.env.VIDEO_ACCELERATION==='cpu')return software;
 const current=cache.get(codec);if(current&&current.until>Date.now())return current.available?hardwareEncoder(codec):software;
 let probe=pending.get(codec);
 if(!probe){probe=new Promise<boolean>(resolve=>{
  execFile('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=25','-frames:v','3','-c:v',hardwareEncoder(codec),'-preset','p4','-f','null','-'],{timeout:8000,windowsHide:true,maxBuffer:32768},error=>{const available=!error;cache.set(codec,{available,until:Date.now()+300000});pending.delete(codec);resolve(available);});
 });pending.set(codec,probe);}
 return await probe?hardwareEncoder(codec):software;
}
export function encoderOptions(codec:VideoCodec,encoder:string,preview=false){
 if(encoder.endsWith('_nvenc'))return ['-c:v',encoder,'-preset','p4','-tune',preview?'ll':'hq','-rc','vbr'];
 return ['-c:v',codec==='h265'?'libx265':'libx264','-preset',preview?'superfast':'veryfast',...(preview?['-threads','2','-tune','zerolatency']:[])];
}
