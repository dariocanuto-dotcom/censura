import si from 'systeminformation';
import { readdir, readFile } from 'node:fs/promises';
const finite=(value:unknown,min=0,max=100)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
async function linuxCpuTemperature(){
  if(process.platform!=='linux')return null;
  for(const entry of await readdir('/sys/class/hwmon').catch(()=>[])){
    const root=`/sys/class/hwmon/${entry}`;
    const name=(await readFile(`${root}/name`,'utf8').catch(()=>'' )).trim();
    if(!/^(coretemp|k10temp|zenpower|cpu_thermal)$/.test(name))continue;
    const values=await Promise.all((await readdir(root)).filter(f=>/^temp\d+_input$/.test(f)).map(async f=>finite(Number(await readFile(`${root}/${f}`,'utf8').catch(()=>''))/1000,1,150)));
    const temperatures=values.filter((v):v is number=>v!==null);
    if(temperatures.length)return Math.max(...temperatures);
  }
  return null;
}
async function sample(){
  const [load,memory,graphics,temperature]=await Promise.all([
    si.currentLoad().catch(()=>null),si.mem().catch(()=>null),si.graphics().catch(()=>null),si.cpuTemperature().catch(()=>null)
  ]);
  const cpuTemperature=finite(temperature?.main,1,150)??await linuxCpuTemperature();
  const gpus=await Promise.all((graphics?.controllers??[]).map(async gpu=>{
    let utilization=finite(gpu.utilizationGpu);
    if(utilization===null && process.platform==='linux' && gpu.busAddress){
      const address=gpu.busAddress.includes('0000:')?gpu.busAddress:`0000:${gpu.busAddress}`;
      if(/^[0-9a-f]{4}:[0-9a-f]{2}:[0-9a-f]{2}\.[0-7]$/i.test(address)){
        const text=await readFile(`/sys/bus/pci/devices/${address}/gpu_busy_percent`,'utf8').catch(()=>null);
        utilization=text===null?null:finite(Number(text));
      }
    }
    return {name:gpu.model,utilization};
  }));
  return {cpu:finite(load?.currentLoad),memory:memory?{used:memory.active,total:memory.total,percent:finite(memory.active/memory.total*100)}:null,gpus,cpuTemperature,updatedAt:new Date().toISOString()};
}
let cached:Awaited<ReturnType<typeof sample>>|undefined;
let pending:Promise<Awaited<ReturnType<typeof sample>>>|undefined;
export async function systemMetrics(){
  if(cached&&Date.now()-Date.parse(cached.updatedAt)<5000)return cached;
  pending??=sample().then(value=>{cached=value;return value;}).finally(()=>{pending=undefined;});
  return pending;
}
