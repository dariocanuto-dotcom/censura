import {spawn} from 'node:child_process';
import {mkdir,writeFile,statfs} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {btsSamplePath} from './bts-window.ts';
import {finalizeRecording} from './recording-file.ts';
export function snapshotPath(root:string,date:Date){return btsSamplePath(root,date).replace(/\.ts$/,'.jpg');}
function frame(input:string|Buffer,args:string[]){return new Promise<Buffer>((resolve,reject)=>{
 const child=spawn('ffmpeg',['-hide_banner','-loglevel','error',...(typeof input==='string'?['-i',input]:['-f','image2pipe','-i','pipe:0']),...args],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const chunks:Buffer[]=[];let bytes=0,error='';child.stdin.on('error',()=>{});
 child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>16*1024*1024)child.kill('SIGKILL');else chunks.push(chunk);});child.stderr.on('data',chunk=>{error=(error+chunk.toString()).slice(-1000);});
 const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
 child.on('error',err=>{clearTimeout(timer);reject(err);});child.on('close',code=>{clearTimeout(timer);if(code===0&&bytes)resolve(Buffer.concat(chunks));else reject(new Error('Não foi possível gerar a foto HD. '+error.slice(-200)));});
 if(Buffer.isBuffer(input))child.stdin.end(input);else child.stdin.end();
 });}
export async function jpegWithinLimit(encode:(quality:number)=>Promise<Buffer>,limit=200000){
 let low=2,high=31,best:Buffer|undefined;
 while(low<=high){const quality=Math.floor((low+high)/2),image=await encode(quality);if(image.length<=limit){best=image;high=quality-1;}else low=quality+1;}
 if(!best)throw new Error('Não foi possível manter a foto abaixo de 200 KB.');return best;
}
export async function saveHdSnapshot(input:string,programId:number|undefined,root:string,date:Date){
 await mkdir(root,{recursive:true});const disk=await statfs(root);if(disk.blocks&&disk.bavail/disk.blocks<=0.1)throw new Error('Fotos suspensas: HD com 10% ou menos livre.');
 const source=await frame(input,['-map',programId?`0:p:${programId}:v:0`:'0:v:0','-frames:v','1','-vf','scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1','-c:v','png','-f','image2pipe','pipe:1']);
 const image=await jpegWithinLimit(quality=>frame(source,['-frames:v','1','-c:v','mjpeg','-pix_fmt','yuvj420p','-q:v',String(quality),'-f','image2pipe','pipe:1']));
 const destination=snapshotPath(root,date);await mkdir(dirname(destination),{recursive:true});const temporary=destination+'.'+randomUUID()+'.partial';await writeFile(temporary,image,{flag:'wx'});
 return {path:await finalizeRecording(temporary,destination),bytes:image.length,width:1920,height:1080};
}
