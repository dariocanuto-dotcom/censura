import {useEffect,useState} from 'react';
export function BtsSamples(){
 const [data,setData]=useState<any>(null),[enabled,setEnabled]=useState(false),[directory,setDirectory]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let alive=true,first=true;const controller=new AbortController();const refresh=async()=>{try{const response=await fetch('/api/bts-samples',{signal:controller.signal});if(!response.ok)throw new Error();const next=await response.json();if(alive){setData(next);if(first){setEnabled(next.config.enabled);setDirectory(next.config.directory);first=false;}}}catch{if(alive)setMessage('Não foi possível consultar as amostras MPEG-TS.');}};void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{alive=false;controller.abort();clearInterval(timer);};},[]);
 const save=async()=>{setSaving(true);setMessage('');try{const response=await fetch('/api/bts-samples',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,directory})});const next=await response.json();if(!response.ok)throw new Error(next.error);setData(next);setMessage(enabled?'Captura automática de MPEG-TS ativada.':'Captura de MPEG-TS desativada.');}catch(error){setMessage(error instanceof Error?error.message:'Falha ao salvar.');}finally{setSaving(false);}};
 return <section className="border border-[#2a3050] rounded-lg p-3 text-xs space-y-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-teal-300">Amostras MPEG-TS · 5 segundos a cada 30 segundos</h3><span className="text-gray-400">{data?.capturing?'Salvando amostra…':data?.running?'Aguardando próxima janela':data?.config.enabled?'Conectando…':'Desativado'}</span></div>
  <p className="text-gray-400">Salva dois arquivos: vídeo leve (200 kb/s + áudio 64 kb/s) e dados originais sem recompressão (tabelas, EPG e closed caption). O arquivo de dados exclui o conteúdo de vídeo e áudio e os pacotes nulos; ele é destinado à análise técnica. Funciona no servidor com o navegador fechado e usa uma pasta separada da gravação contínua.</p>
  <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Ativar amostras MPEG-TS automáticas</label>
  <label className="block">Pasta das amostras MPEG-TS<input className="w-full mt-1 bg-[#1a1f2e] border border-[#2a3050] rounded p-2" value={directory} onChange={e=>setDirectory(e.target.value)}/></label>
  <p className="font-mono text-[11px] text-gray-500 break-all">2026/10/15102026/freme15102026-11h24s30_video.ts + freme15102026-11h24s30_dados.ts</p>
  <p className="text-gray-500">Janelas nos segundos 00 e 30, no horário de Brasília. Os arquivos são mantidos; a captura é suspensa se restarem 10% ou menos no HD. Cortes incompletos ficam com extensão .partial.</p>
  {data?.source&&<p>Entrada: {data.source}</p>}
  {data?.lastSample&&<p className="text-gray-400 break-all">Última amostra: {data.lastSample.path} · {(data.lastSample.bytes/1048576).toFixed(1)} MB{data.lastSample.dataPath&&<> · Dados: {data.lastSample.dataPath} ({(data.lastSample.dataBytes/1048576).toFixed(2)} MB)</>}. Estimativa: {((data.lastSample.totalBytes??data.lastSample.bytes)*2880/1e9).toFixed(1)} GB/dia.</p>}
  {data?.error&&<p className="text-amber-300">{data.error}</p>}
  <button type="button" disabled={saving||!data} onClick={()=>void save()} className="bg-teal-800 rounded px-3 py-2 disabled:opacity-50">{saving?'Salvando…':'Salvar amostras MPEG-TS'}</button>
  {message&&<p role="status" className="text-gray-300">{message}</p>}
 </section>;
}

export function SampleRecordingStatus(){
 const [data,setData]=useState<any>(null);
 useEffect(()=>{let alive=true;const refresh=async()=>{try{const r=await fetch('/api/bts-samples');if(r.ok){const next=await r.json();if(alive)setData(next);}}catch{if(alive)setData(null);}};void refresh();const timer=setInterval(()=>void refresh(),2000);return()=>{alive=false;clearInterval(timer);};},[]);
 return <div className="mt-2 border-t border-gray-800 pt-2 text-xs" role="status"><span className={data?.error?'text-amber-400':data?.running?'text-teal-300':'text-gray-400'}>{!data?'Amostras: consultando…':data.error?`Amostras: ${data.error}`:data.capturing?'● REC · Gravando amostra MPEG-TS':data.running?'● Amostras ativas · aguardando próxima captura':data.config.enabled?'Amostras: reconectando…':'Amostras desativadas'}</span><div className="text-gray-500 text-[10px]">5 s a cada 30 s · vídeo 200 kb/s + áudio 64 kb/s · dados originais separados</div></div>;
}
