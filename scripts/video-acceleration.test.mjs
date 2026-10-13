import test from 'node:test';
import assert from 'node:assert/strict';
import {encoderOptions,videoEncoder,hardwareFailure} from '../artifacts/api-server/src/lib/video-acceleration.ts';
test('NVENC mantém H.264/H.265 e usa preset de hardware',()=>{assert.deepEqual(encoderOptions('h264','h264_nvenc',true),['-c:v','h264_nvenc','-preset','p4','-tune','ll','-rc','vbr']);assert.equal(encoderOptions('h265','hevc_nvenc')[1],'hevc_nvenc');});
test('modo CPU mantém os encoders anteriores',async()=>{const old=process.env.VIDEO_ACCELERATION;process.env.VIDEO_ACCELERATION='cpu';try{assert.equal(await videoEncoder('h264'),'libx264');assert.equal(await videoEncoder('h265'),'libx265');}finally{if(old===undefined)delete process.env.VIDEO_ACCELERATION;else process.env.VIDEO_ACCELERATION=old;}});
test('falha do driver força fallback sem nova tentativa imediata',async()=>{hardwareFailure('h264','Cannot load libcuda.so.1');assert.equal(await videoEncoder('h264'),'libx264');hardwareFailure('h265','OpenEncodeSessionEx failed: out of memory');assert.equal(await videoEncoder('h265'),'libx265');});

import {canCopyPreview} from '../artifacts/api-server/src/lib/preview-format.ts';
test('preview direto exige H264 8 bits compatível e até Full HD 30 fps',()=>{assert(canCopyPreview({codec:'h264',pixelFormat:'yuv420p',fps:29.97,resolucao:'1920x1080'}));assert(!canCopyPreview({codec:'hevc',pixelFormat:'yuv420p',fps:25,resolucao:'1280x720'}));assert(!canCopyPreview({codec:'h264',pixelFormat:'yuv420p10le',fps:25,resolucao:'1280x720'}));assert(!canCopyPreview({codec:'h264',pixelFormat:'yuv420p',fps:60,resolucao:'1920x1080'}));assert(!canCopyPreview(undefined));});
