import {createReadStream,createWriteStream} from 'node:fs';
import {stat,unlink} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {TransportData} from './transport-data.ts';
import {videoEncoder,encoderOptions,hardwareFailure} from './video-acceleration.ts';
import {finalizeRecording} from './recording-file.ts';
import type {BtsSample} from './bts-window.ts';
export async function samplePair(sample:BtsSample,programId?:number){
 const prefix=sample.path.replace(/\.ts$/,''),dataTemporary=prefix+'.dados-'+randomUUID()+'.partial';
 await pipeline(createReadStream(sample.path),new TransportData(),createWriteStream(dataTemporary,{flags:'wx'}));
 const dataPath=await finalizeRecording(dataTemporary,prefix+'_dados.ts');
 const videoTemporary=prefix+'.video-'+randomUUID()+'.partial';
 const encode=async(encoder:string)=>new Promise<void>((resolve,reject)=>{
  const program=programId?`p:${programId}:`:'';
  const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i',sample.path,'-map',`0:${program}v:0`,'-map',`0:${program}a:0?`,'-vf','setpts=PTS-STARTPTS,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1',...encoderOptions('h264',encoder),'-pix_fmt','yuv420p','-b:v','200k','-maxrate','200k','-bufsize','400k','-af','asetpts=PTS-STARTPTS','-t','5','-fps_mode','vfr','-c:a','aac','-b:a','64k','-ac','2','-ar','48000','-f','mpegts',videoTemporary],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let message='';child.stderr.on('data',chunk=>{message=(message+chunk.toString()).slice(-3000);});
  const timer=setTimeout(()=>{child.kill('SIGKILL');},60000);
  child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);if(code===0)resolve();else{hardwareFailure('h264',message);reject(new Error('Falha ao gerar vídeo leve; amostra original preservada.'));}});
 });
 const encoder=await videoEncoder('h264');
 try{await encode(encoder);}catch(error){await unlink(videoTemporary).catch(()=>{});if(!encoder.endsWith('_nvenc'))throw error;await encode('libx264');}
 const videoPath=await finalizeRecording(videoTemporary,prefix+'_video.ts');
 const bytes=(await stat(videoPath)).size,dataBytes=(await stat(dataPath)).size;
 await unlink(sample.path);
 return {...sample,path:videoPath,bytes,dataPath,dataBytes,totalBytes:bytes+dataBytes,mode:'video-and-data'};
}
