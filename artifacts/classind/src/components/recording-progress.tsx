import { useEffect, useState } from 'react';
export interface RecordingProgressChannel {
  id:string; name:string; format?:string; running?:boolean;blockMinutes?:number;
  activeBlock?:{name:string;start:string;end:string;bytes:number}|null;
}
const duration=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export function RecordingProgress({channels,serverTime,compact=false}:{channels:RecordingProgressChannel[];serverTime?:string;compact?:boolean}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    const offset=serverTime?Date.parse(serverTime)-Date.now():0;
    const update=()=>setNow(Date.now()+offset);update();
    const timer=setInterval(update,1000);return()=>clearInterval(timer);
  },[serverTime]);
  return <div className="space-y-3 my-3">{channels.filter(channel=>channel.running).map(channel=>{
    const block=channel.activeBlock;
    if(!block)return <p key={channel.id} className="text-xs text-amber-300">{channel.name} · aguardando início do bloco / recebimento do sinal…</p>;
    const start=Date.parse(block.start),end=Date.parse(block.end);
    const elapsed=Math.max(0,(now-start)/1000),remaining=Math.max(0,Math.ceil((end-now)/1000));
    const progress=Math.max(0,Math.min(99,100*(now-start)/Math.max(1,end-start)));
    if(compact)return <div key={channel.id} className="flex flex-col gap-1">
      <div className="flex justify-between gap-2 text-[10px] font-mono"><span className="text-orange-400">Bloco em gravação</span><span className="text-gray-400">{duration(elapsed)} / {duration(Math.max(0,(end-start)/1000))} · {remaining?`${duration(remaining)} restam`:'finalizando…'}</span></div>
      <div role="progressbar" aria-label={`Gravação de ${channel.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)} className="w-full bg-[#1a1f2e] rounded-full h-2 overflow-hidden"><div className="h-full bg-gradient-to-r from-teal-600 to-teal-400 transition-[width] duration-1000 rounded-full" style={{width:`${progress}%`}}/></div>
      <div className="flex justify-between text-[9px] text-gray-600 font-mono"><span>0:00</span><span className="text-orange-400">↓ corte automático</span><span>{duration(Math.max(0,(end-start)/1000))}</span></div>
    </div>;
    return <div key={channel.id} className="rounded border border-[#2a3050] bg-[#111827] p-2">
      <div className="flex justify-between gap-2 text-xs"><strong className="text-teal-300">● {channel.name}</strong><span className="text-gray-300">{remaining?`Faltam ${duration(remaining)}`:'Finalizando bloco…'}</span></div>
      <p className="text-[10px] text-gray-400 break-all my-1">Bloco atual: {block.name}</p>
      <div role="progressbar" aria-label={`Gravação de ${channel.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)} className="h-2 rounded bg-[#1a1f2e] overflow-hidden"><div className="h-full bg-teal-500 transition-[width] duration-1000" style={{width:`${progress}%`}}/></div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-400"><span>Decorrido: {duration(elapsed)}</span><span>{Math.floor(progress)}% · {(block.bytes/1000000).toFixed(1)} MB</span></div>
    </div>;
  })}</div>;
}
