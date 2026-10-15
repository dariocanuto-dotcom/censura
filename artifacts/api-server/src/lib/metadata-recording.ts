import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {TransportData} from './transport-data.ts';
import {captureTransport} from './raw-recording.ts';

export function metadataRecording(url:string,folder:(date:Date)=>string,minutes:number,prefix:string,onComplete:Parameters<typeof captureTransport>[4]){
 const worker=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-rw_timeout','8000000','-f','data','-i',url,'-map','0:0','-c','copy','-f','data','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const filter=new TransportData();let error:string|null=null,active=true,lastReceived=Date.now();
 worker.stdin.on('error',()=>{});worker.stderr.resume();worker.on('error',()=>{error='Falha ao iniciar captura dos dados originais.';filter.destroy(new Error(error));});
 worker.stdout.on('data',()=>{lastReceived=Date.now();});worker.stdout.on('error',err=>filter.destroy(err));worker.stdout.pipe(filter);
 const watchdog=setInterval(()=>{if(Date.now()-lastReceived>15000){error='Dados da transmissão interrompidos; reconectando.';worker.kill('SIGKILL');}},5000);watchdog.unref();
 const done=captureTransport(filter,date=>join(folder(date),'dados_transmissao'),minutes,()=>{},onComplete,prefix,Date.now,'txt').catch(()=>{error='Falha ao salvar dados originais da transmissão.';worker.kill('SIGKILL');}).finally(()=>{active=false;clearInterval(watchdog);});
 return {get active(){return active;},get error(){return error;},done,async stop(){worker.stdin.write('q\n');const timer=setTimeout(()=>worker.kill('SIGKILL'),2500);try{await done;}finally{clearTimeout(timer);}}};
}
