import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
interface Stream {codec:string;pixelFormat?:string;fps?:number;resolucao?:string}
const path=resolve('.runtime/recording-service/preview-formats.json');
const formats=new Map<string,{compatible:boolean;until:number}>();
let loaded:Promise<void>|undefined,saving=Promise.resolve();
export function canCopyPreview(stream?:Stream){
 if(!stream||stream.codec!=='h264'||!['yuv420p','nv12'].includes(stream.pixelFormat??'')||!stream.fps||stream.fps>30)return false;
 const [width,height]=(stream.resolucao??'').split('x').map(Number);
 return width>0&&width<=1920&&height>0&&height<=1080;
}
export function previewKey(url:string,program?:number){return createHash('sha256').update(JSON.stringify([url,program])).digest('hex');}
async function load(){await (loaded??=readFile(path,'utf8').then(text=>{for(const [key,value] of Object.entries(JSON.parse(text)) as [string,{compatible:boolean;until:number}][])if(value.until>Date.now())formats.set(key,value);}).catch(()=>{}));}
export async function previewCopyAllowed(key:string){await load();const value=formats.get(key);return Boolean(value?.compatible&&value.until>Date.now());}
export async function rememberPreviewFormat(key:string,stream?:Stream){
 await load();const compatible=canCopyPreview(stream);formats.set(key,{compatible,until:Date.now()+86400000});
 saving=saving.catch(()=>{}).then(async()=>{await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(Object.fromEntries([...formats].slice(-128))),{mode:0o600});await rename(path+'.tmp',path);});await saving;return compatible;
}
