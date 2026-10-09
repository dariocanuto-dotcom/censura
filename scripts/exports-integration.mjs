import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(resolve('artifacts/api-server/package.json'));
await require('esbuild').build({entryPoints:[resolve('artifacts/api-server/src/lib/conversions.ts')],bundle:true,platform:'node',format:'cjs',outfile:resolve('.runtime/conversions-test.cjs')});
const {conversionArgs,exportFormats}=require(resolve('.runtime/conversions-test.cjs'));
const root=resolve('.runtime/format-validation');await mkdir(root,{recursive:true});
const fixture=join(root,'fixture.mp4');const fixtureResult=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','sine=frequency=1000:sample_rate=48000','-t','2','-c:v','libx264','-c:a','aac','-y',fixture],{encoding:'utf8',windowsHide:true});assert.equal(fixtureResult.status,0,fixtureResult.stderr);let failed=0;
for(const {format,profile,extension} of [...exportFormats.map(f=>({format:f.id,profile:'auto',extension:f.extension})),{format:'mp4',profile:'h265',extension:'mp4'},{format:'mxf',profile:'xdcamhd',extension:'mxf'},{format:'mxf',profile:'xavc',extension:'mxf'}]){
 const file=join(root,`${format}-${profile}.${extension}`),args=conversionArgs(fixture,file,format,profile);args.splice(args.length-1,0,'-t','1');
 const result=spawnSync('ffmpeg',args,{encoding:'utf8',windowsHide:true,timeout:60000});
 if(result.status!==0){console.log(`FAIL ${format}/${profile}: ${result.stderr.slice(-1800)}`);failed++;continue;}
 const probe=spawnSync('ffprobe',['-v','quiet','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});const data=JSON.parse(probe.stdout);assert.ok(data.streams.find(s=>s.codec_type==='video'));assert.ok(data.streams.find(s=>s.codec_type==='audio'));console.log(`OK ${format}/${profile}: ${data.streams.find(s=>s.codec_type==='video').codec_name}, ${data.streams.find(s=>s.codec_type==='audio').codec_name}`);
}
assert.equal(failed,0,'Todos os formatos precisam produzir vídeo/áudio válidos');
