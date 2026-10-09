import ExcelJS from 'exceljs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function createBtsWorkbook(report: any) {
  const workbook=new ExcelJS.Workbook();
  const candidates=[resolve('templates/bts-report.xlsx'),resolve('artifacts/api-server/templates/bts-report.xlsx')];
  let template:string|undefined;
  for(const path of candidates){try{await access(path);template=path;break;}catch{}}
  if(!template)throw new Error('Modelo do relatório BTS não encontrado.');
  await workbook.xlsx.readFile(template);
  const overview=workbook.worksheets[0],epg=workbook.worksheets[1];
  // Replace sample values and invalid decorative cells; preserve template styles.
  for(const sheet of [overview,epg]){sheet.getCell('B1').value=null;sheet.getCell('C1').value='RELATÓRIO TÉCNICO DE TRANSMISSÃO DO BTS';sheet.getCell('B2').value=`Sistema: ${report.sistema??'SERVER DTV+ CENSURA PRO'}`;sheet.views=[{state:'frozen',ySplit:sheet===epg?6:4,showGridLines:false}];}
  const audit=(id:string)=>report.auditoria?.find((check:any)=>check.id===id)?.detalhe??'Não disponível';
  const local=(value:string|number|null)=>value===null?'Não informado':new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const values=[local(report.geradoEm),report.fonte?.nome??'Não disponível',report.programaSelecionado??'Não disponível',audit('video'),audit('audio'),audit('closed_caption'),audit('epg'),audit('loudness'),report.auditoria?.filter((check:any)=>check.status==='erro').map((check:any)=>check.label).join(', ')||'Nenhuma',`${report.sinal?.metricas?.bitrate??'Não disponível'} Mbps`,report.sinal?.metricas?.dropped??'Não disponível',report.sinal?.metricas?.strength===undefined?'Não disponível':`${report.sinal.metricas.strength}%`];
  values.forEach((value,row)=>{const cell=overview.getCell(row+5,3);cell.value=value;cell.alignment={...cell.alignment,wrapText:true,vertical:'middle'};overview.getRow(row+5).height=Math.max(22,Math.ceil(String(value).length/95)*16);});
  const styles=Array.from({length:10},(_,i)=>structuredClone(epg.getCell(7,i+2).style));
  if(epg.rowCount>=7)epg.spliceRows(7,epg.rowCount-6);
  const events=report.epg?.eventosProgramaSelecionado??report.epg?.eventos??[];
  epg.getCell('B4').value=`GRADE DE PROGRAMAÇÃO (EPG) · ${report.programaSelecionado??''} · Horários de Brasília`;
  const now=Date.parse(report.geradoEm);
  events.forEach((event:any,index:number)=>{
    const start=event.startTime?Date.parse(event.startTime):null,end=start===null?null:start+event.durationSec*1000;
    const state=start===null?'Sem horário':start>now?'Próximo':end!>now?'No ar':'Encerrado';
    const duration=`${Math.floor(event.durationSec/3600)}h ${Math.floor(event.durationSec%3600/60)}min`;
    const data=[event.serviceId,event.eventId,event.title??'',local(start),local(end),event.durationSec,state,event.description??'',`0x${Number(event.tableId).toString(16)}`,duration];
    data.forEach((value,col)=>{const cell=epg.getCell(index+7,col+2);cell.style=structuredClone(styles[col]);cell.value=value;cell.alignment={...cell.alignment,wrapText:true,vertical:'middle'};});
    epg.getRow(index+7).height=Math.max(30,Math.ceil(String(event.title??'').length/45)*15,Math.ceil(String(event.description??'').length/170)*15);
    const status=epg.getCell(index+7,8);status.fill={type:'pattern',pattern:'solid',fgColor:{argb:state==='No ar'?'FFD1FAE5':state==='Próximo'?'FFFEF3C7':'FFF3F4F6'}};
  });
  if(!events.length)epg.getCell('B7').value='Sem eventos EPG recebidos para o programa selecionado.';
  epg.autoFilter={from:'B6',to:`K${Math.max(7,events.length+6)}`};
  workbook.creator=report.responsavel??'DC Censura';workbook.modified=new Date();
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
