export type ReportPeriod='moment'|'day'|'week'|'month';
export function reportWindow(period:ReportPeriod,date?:string,now=new Date()){
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const selected=date??local;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(selected))throw new Error('Data inválida.');
  const base=new Date(selected+'T00:00:00-03:00');
  if(!Number.isFinite(base.getTime())||base.toISOString().slice(0,10)!==selected)throw new Error('Data inválida.');
  let start=base.getTime(),end=start+86400000;
  if(period==='moment'){start=now.getTime()-60000;end=now.getTime();}
  else if(period==='week'){const day=base.getUTCDay();start-=(day===0?6:day-1)*86400000;end=start+7*86400000;}
  else if(period==='month'){start=Date.parse(selected.slice(0,7)+'-01T00:00:00-03:00');const next=new Date(start);next.setUTCMonth(next.getUTCMonth()+1);end=next.getTime();}
  else if(period!=='day')throw new Error('Período inválido.');
  return {period,start:new Date(start).toISOString(),end:new Date(end).toISOString(),key:`${period}-${new Date(start).toISOString().slice(0,10)}`};
}
export function completedWindow(period:Exclude<ReportPeriod,'moment'>,now=new Date()){
  const current=reportWindow(period,undefined,now);
  return reportWindow(period,new Date(Date.parse(current.start)-86400000).toISOString().slice(0,10),now);
}
