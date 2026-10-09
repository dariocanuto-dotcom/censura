import {useEffect,useState} from 'react';
interface Spec {formats:{id:string;label:string}[];profiles:{id:string;label:string;formats:string[]}[]}
export function RecordingExport({fileId,selectedProgram}:{fileId:string;selectedProgram?:number}) {
  const [spec,setSpec]=useState<Spec>(),[format,setFormat]=useState('mp4'),[profile,setProfile]=useState('auto');
  const [job,setJob]=useState<any>(),[error,setError]=useState(''),[sending,setSending]=useState(false);
  const [program,setProgram]=useState(selectedProgram?.toString()??'');
  useEffect(()=>{void fetch('/api/recordings/formats').then(r=>r.json()).then(setSpec).catch(()=>setError('Falha ao consultar formatos.'));},[]);
  useEffect(()=>{
    if(!job?.id||job.status!=='converting')return;
    const refresh=async()=>{try{const response=await fetch(`/api/recordings/conversions/${job.id}`);const data=await response.json();if(!response.ok)throw new Error(data.error);setJob(data);}catch(error){setError(String(error));setJob((old:any)=>({...old,status:'error'}));}};
    void refresh();const timer=setInterval(()=>void refresh(),2000);return()=>clearInterval(timer);
  },[job?.id,job?.status]);
  const convert=async()=>{setSending(true);setError('');try{const response=await fetch(`/api/recordings/files/${fileId}/convert`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format,profile,programId:program?Number(program):undefined})});const data=await response.json();if(!response.ok)throw new Error(data.error);setJob(data);}catch(error){setError(String(error));}finally{setSending(false);}};
  return <div className="space-y-2 border border-[#2a3050] rounded p-3">
    <p className="text-sm text-teal-300">Exportar cópia do bloco selecionado</p>
    <p className="text-xs text-gray-400">O original TS/BTS permanece completo. A cópia convertida contém vídeo e áudio; tabelas, PIDs e CC/EPG originais ficam no TS e em Informações BTS.</p>
    <div className="flex flex-wrap gap-2 text-xs"><select aria-label="Formato de exportação" className="bg-[#1a1f2e] rounded p-2" value={format} onChange={e=>{setFormat(e.target.value);setProfile('auto');}}>{spec?.formats.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select>
    <select aria-label="Codec de exportação" className="bg-[#1a1f2e] rounded p-2" value={profile} onChange={e=>setProfile(e.target.value)}>{spec?.profiles.filter(p=>p.formats.includes(format)).map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select>
    <input aria-label="Programa para exportação" className="bg-[#1a1f2e] rounded p-2 w-36" type="number" min={0} max={65535} placeholder="Programa: automático" value={program} onChange={e=>setProgram(e.target.value)}/>
    <button disabled={sending||job?.status==='converting'||!spec} onClick={convert} className="bg-teal-800 disabled:opacity-40 rounded px-3 py-2">Converter</button></div>
    {job?.status==='converting'&&<div className="text-xs text-teal-300">Convertendo · {Math.floor(job.percent??0)}%<progress className="block w-full h-2 mt-1" max={100} value={job.percent??0}/></div>}
    {job?.status==='ready'&&<a className="text-xs text-teal-300 underline" href={job.downloadUrl??`/api/recordings/conversions/${job.id}/download`}>Baixar arquivo convertido</a>}
    {(error||job?.error)&&<p className="text-xs text-red-400">{error||job.error}</p>}
  </div>;
}
