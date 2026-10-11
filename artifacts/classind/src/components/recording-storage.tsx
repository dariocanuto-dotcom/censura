import { useEffect, useState } from 'react';
interface Storage { total:number;free:number;used:number;directory:string;updatedAt:string }
const size=(bytes:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(bytes/(bytes>=1e12?1e12:1e9))+(bytes>=1e12?' TB':' GB');
export function RecordingStorage({directory}:{directory?:string}){
  const [storage,setStorage]=useState<Storage|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let alive=true;const controller=new AbortController();
    setStorage(null);setError(false);
    const refresh=async()=>{try{
      const response=await fetch('/api/recordings/storage',{signal:controller.signal});
      if(!response.ok)throw new Error();const data=await response.json();
      if(alive){setStorage(data);setError(false);}
    }catch{if(alive)setError(true);}};
    void refresh();const timer=setInterval(()=>void refresh(),11*60*1000);
    return()=>{alive=false;controller.abort();clearInterval(timer);};
  },[directory]);
  if(!storage)return <span className="text-[10px] text-gray-500">{error?'HD indisponível':'Consultando HD…'}</span>;
  const percent=storage.total?Math.min(100,storage.used/storage.total*100):0;
  return <div className="flex items-center gap-2 text-[10px] text-gray-400" title={`${storage.directory} · Atualizado ${new Date(storage.updatedAt).toLocaleTimeString('pt-BR')} · Atualização a cada 11 minutos${error?' · Última consulta falhou':''}`}>
    <span>HD {size(storage.total)}</span>
    <div role="meter" aria-label="Espaço utilizado no HD de gravação" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} className="w-16 h-1.5 bg-gray-800 rounded overflow-hidden"><div className={storage.free/storage.total<=0.1?'h-full bg-red-500':'h-full bg-teal-500'} style={{width:`${percent}%`}}/></div>
    <span>{size(storage.used)} usados · <span className="text-teal-300">{size(storage.free)} livres</span>{error?' · desatualizado':''}</span>
  </div>;
}
