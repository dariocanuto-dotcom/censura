import { useEffect, useState } from 'react';
interface Metrics {cpu:number|null;memory:{used:number;total:number;percent:number|null}|null;gpus:{name:string;utilization:number|null}[];cpuTemperature:number|null;updatedAt:string}
const percent=(value:number|null|undefined)=>value==null?'Indisponível':`${value.toFixed(1)}%`;
function Meter({value}:{value:number|null|undefined}){return value==null?null:<span className="w-12 h-1.5 bg-gray-800 rounded overflow-hidden"><span className={`block h-full ${value>=90?'bg-red-400':value>=75?'bg-amber-400':'bg-teal-400'}`} style={{width:`${value}%`}}/></span>;}
export function SystemStatusBar(){
 const [metrics,setMetrics]=useState<Metrics|null>(null),[offline,setOffline]=useState(false);
 useEffect(()=>{let alive=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
 const refresh=async()=>{try{const response=await fetch('/api/system/metrics',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});if(!response.ok)throw new Error();const data=await response.json();if(alive){setMetrics(data);setOffline(false);}}catch{if(alive)setOffline(true);}finally{if(alive)timer=setTimeout(()=>void refresh(),5000);}};
 void refresh();return()=>{alive=false;controller.abort();clearTimeout(timer);};},[]);
 return <footer aria-label="Monitoramento do servidor" className="fixed bottom-0 inset-x-0 z-40 bg-[#10151e] border-t border-[#293244] px-4 py-2 text-[11px] text-gray-300 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 shadow-lg">
 <span className="text-gray-500">Servidor{offline?' · sem conexão':''}</span>
 <span className="flex items-center gap-2">CPU <strong>{percent(metrics?.cpu)}</strong><Meter value={metrics?.cpu}/></span>
 <span className="flex items-center gap-2">Memória <strong>{metrics?.memory?`${(metrics.memory.used/1073741824).toFixed(1)} / ${(metrics.memory.total/1073741824).toFixed(1)} GB`:'Indisponível'}</strong><Meter value={metrics?.memory?.percent}/></span>
 {(metrics?.gpus.length?metrics.gpus:[{name:'GPU',utilization:null}]).map((gpu,i)=><span key={i} title={gpu.name} className="flex items-center gap-2">GPU{(metrics?.gpus.length??0)>1?` ${i+1}`:''} <strong>{percent(gpu.utilization)}</strong><Meter value={gpu.utilization}/></span>)}
 <span>Temperatura CPU <strong className={(metrics?.cpuTemperature??0)>=85?'text-red-400':'text-teal-300'}>{metrics?.cpuTemperature==null?'Sensor indisponível':`${metrics.cpuTemperature.toFixed(1)} °C`}</strong></span>
 </footer>;
}
