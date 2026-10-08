import express, { Router } from "express";
import { spawn } from "node:child_process";
import { access, mkdir, rm, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { logger } from "../lib/logger";
import { parseAssDialogue } from "./arib";

const router = Router();
const streamRoot = join(tmpdir(), "dccp-srt-streams");
const streamSessions = new Map<string, StreamSession>();

interface StreamSession {
  id: string;
  dir: string;
  process: ReturnType<typeof spawn>;
  createdAt: number;
  lastError: string | null;
}

interface SrtProbeResult {
  ok: boolean;
  conectado: boolean;
  streams: StreamInfo[];
  formato: FormatoInfo | null;
  canal: CanalInfo | null;
  canais: CanalInfo[];
  erro: string | null;
  duracaoProbeMs: number;
  url: string;
}

interface StreamInfo {
  index: number;
  id?: number;
  codec: string;
  codecNome?: string;
  tipo: "video" | "audio" | "data" | "outro";
  resolucao?: string;
  fps?: number;
  bitrate?: number;
  canais?: number;
  amostragem?: number;
  perfil?: string;
  nivel?: string;
  pixelFormat?: string;
  idioma?: string;
  titulo?: string;
}

interface FormatoInfo {
  container: string;
  duracao: number;
  bitrateTotalKbps: number;
  programas: number;
  titulo?: string;
  provedor?: string;
}

interface CanalInfo {
  programaId?: number;
  programaNumero?: number;
  pmtPid?: number;
  pcrPid?: number;
  nome?: string;
  provedor?: string;
  streams?: number[];
  temVideo?: boolean;
  temAudio?: boolean;
}

interface EpgEvent {
  eventId: number;
  serviceId: number;
  tableId: number;
  version: number;
  sectionNumber: number;
  title: string;
  description: string;
  startTime: string | null;
  durationSec: number;
}

function buildSrtUrl(host: string, port: number, mode: string, latencyMs: number, passphrase?: string, streamId?: string) {
  const params = new URLSearchParams();
  params.set("mode", mode === "listener" ? "listener" : "caller");
  if (latencyMs) params.set("latency", String(latencyMs * 1000)); // microseconds
  if (passphrase) params.set("passphrase", passphrase);
  if (streamId) params.set("streamid", streamId);
  return `srt://${host}:${port}?${params.toString()}`;
}

function decodeBcd(value: number): number {
  return ((value >> 4) * 10) + (value & 0x0f);
}

function decodeEpgText(bytes: Buffer): string {
  const clean = bytes.filter(byte => byte >= 0x20 && byte !== 0x7f);
  if (clean.length === 0) return "";
  const utf8 = new TextDecoder("utf-8").decode(Uint8Array.from(clean)).replace(/\u0000/g, "").trim();
  const latin1 = new TextDecoder("iso-8859-1").decode(Uint8Array.from(clean)).replace(/\u0000/g, "").trim();
  return (utf8.includes("\ufffd") ? latin1 : utf8).replace(/\s+/g, " ");
}

function decodeEpgStartTime(bytes: Buffer): string | null {
  if (bytes.length < 5 || bytes.every(byte => byte === 0xff)) return null;
  const mjd = (bytes[0] << 8) | bytes[1];
  const date = new Date(Date.UTC(1858, 10, 17) + mjd * 86400000);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(decodeBcd(bytes[2]), decodeBcd(bytes[3]), decodeBcd(bytes[4]), 0);
  // ISDB-Tb transmite a referência de Brasília (UTC-3) no campo EIT.
  return new Date(date.getTime() + 3 * 3600000).toISOString();
}

function decodeEpgDuration(bytes: Buffer): number {
  if (bytes.length < 3 || bytes.every(byte => byte === 0xff)) return 0;
  return (decodeBcd(bytes[0]) * 3600) + (decodeBcd(bytes[1]) * 60) + decodeBcd(bytes[2]);
}

function parseEitDescriptors(bytes: Buffer): { title: string; description: string } {
  let title = "";
  const descriptionParts: string[] = [];
  let offset = 0;
  while (offset + 2 <= bytes.length) {
    const tag = bytes[offset];
    const length = bytes[offset + 1];
    const content = bytes.subarray(offset + 2, offset + 2 + length);
    if (content.length < length) break;
    if (tag === 0x4d && content.length >= 5) {
      const nameLength = content[3];
      const nameStart = 4;
      title = decodeEpgText(content.subarray(nameStart, nameStart + nameLength));
      const textLengthOffset = nameStart + nameLength;
      if (textLengthOffset < content.length) {
        const textLength = content[textLengthOffset];
        descriptionParts.push(decodeEpgText(content.subarray(textLengthOffset + 1, textLengthOffset + 1 + textLength)));
      }
    } else if (tag === 0x4e && content.length >= 6) {
      let itemOffset = 4;
      const itemsLength = content[itemOffset] ?? 0;
      itemOffset += 1;
      const itemsEnd = Math.min(content.length, itemOffset + itemsLength);
      while (itemOffset + 2 <= itemsEnd) {
        const itemDescriptionLength = content[itemOffset++];
        itemOffset += itemDescriptionLength;
        if (itemOffset >= itemsEnd) break;
        const itemLength = content[itemOffset++];
        descriptionParts.push(decodeEpgText(content.subarray(itemOffset, itemOffset + itemLength)));
        itemOffset += itemLength;
      }
      if (itemsEnd < content.length) {
        const textLength = content[itemsEnd] ?? 0;
        descriptionParts.push(decodeEpgText(content.subarray(itemsEnd + 1, itemsEnd + 1 + textLength)));
      }
    }
    offset += 2 + length;
  }
  return { title, description: descriptionParts.filter(Boolean).join(" ").trim() };
}

function parseEitSection(section: Buffer): EpgEvent[] {
  if (section.length < 18 || section[0] < 0x4e || section[0] > 0x6f) return [];
  const sectionLength = ((section[1] & 0x0f) << 8) | section[2];
  const sectionEnd = Math.min(section.length, 3 + sectionLength - 4);
  const serviceId = (section[3] << 8) | section[4];
  const version = (section[5] >> 1) & 0x1f;
  const sectionNumber = section[6];
  const events: EpgEvent[] = [];
  let offset = 14;
  while (offset + 12 <= sectionEnd) {
    const eventId = (section[offset] << 8) | section[offset + 1];
    const startTime = decodeEpgStartTime(section.subarray(offset + 2, offset + 7));
    const durationSec = decodeEpgDuration(section.subarray(offset + 7, offset + 10));
    const descriptorsLength = ((section[offset + 10] & 0x0f) << 8) | section[offset + 11];
    const descriptorStart = offset + 12;
    const descriptorEnd = Math.min(sectionEnd, descriptorStart + descriptorsLength);
    if (descriptorEnd > descriptorStart) {
      const descriptor = parseEitDescriptors(section.subarray(descriptorStart, descriptorEnd));
      events.push({
        eventId, serviceId, tableId: section[0], version, sectionNumber,
        title: descriptor.title || `Evento ${eventId}`,
        description: descriptor.description,
        startTime, durationSec,
      });
    }
    offset = descriptorEnd;
  }
  return events;
}

function createEitCollector() {
  let sectionBuffer = Buffer.alloc(0);
  const events = new Map<string, EpgEvent>();

  const consumeSections = (bytes: Buffer) => {
    sectionBuffer = Buffer.concat([sectionBuffer, bytes]);
    while (sectionBuffer.length >= 3) {
      if (sectionBuffer[0] < 0x4e || sectionBuffer[0] > 0x6f) {
        const nextSection = sectionBuffer.findIndex(byte => byte >= 0x4e && byte <= 0x6f);
        if (nextSection < 0) {
          sectionBuffer = sectionBuffer.subarray(-2);
          return;
        }
        sectionBuffer = sectionBuffer.subarray(nextSection);
        if (sectionBuffer.length < 3) return;
      }
      const length = 3 + (((sectionBuffer[1] & 0x0f) << 8) | sectionBuffer[2]);
      if (length < 7 || length > 4096) {
        sectionBuffer = sectionBuffer.subarray(1);
        continue;
      }
      if (sectionBuffer.length < length) return;
      for (const event of parseEitSection(sectionBuffer.subarray(0, length))) {
        events.set(`${event.serviceId}:${event.eventId}:${event.startTime ?? ""}`, event);
      }
      sectionBuffer = sectionBuffer.subarray(length);
    }
  };

  return {
    push: consumeSections,
    result(): EpgEvent[] {
      return [...events.values()].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    },
  };
}

function ffprobe(url: string, timeoutMs: number): Promise<SrtProbeResult> {
  return new Promise(resolve => {
    const t0 = Date.now();
    const args = [
      "-v", "quiet",
      "-analyzeduration", "10000000",
      "-probesize", "10000000",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      "-timeout", String(timeoutMs * 1000), // microseconds
      url,
    ];

    const proc = spawn("ffprobe", args, { timeout: timeoutMs + 2000 });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const fail = (erro: string) => {
      resolve({ ok: false, conectado: false, streams: [], formato: null, canal: null, canais: [], erro, duracaoProbeMs: Date.now()-t0, url });
    };

    const timer = setTimeout(() => { proc.kill("SIGKILL"); fail(`Timeout (${timeoutMs}ms) — sem resposta do servidor SRT`); }, timeoutMs + 1500);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !stdout.trim()) {
        const msg = stderr.split("\n").filter(l => l.toLowerCase().includes("error") || l.toLowerCase().includes("connection")).slice(0,3).join("; ") || stderr.slice(0,300) || `ffprobe saiu com código ${code}`;
        return fail(msg.trim());
      }
      try {
        const data = JSON.parse(stdout) as {
          streams?: {
            index: number; id?: number; codec_name: string; codec_long_name?: string; codec_type: string;
            width?: number; height?: number;
            r_frame_rate?: string; avg_frame_rate?: string;
            bit_rate?: string; channels?: number; sample_rate?: string;
            profile?: string; level?: number; pix_fmt?: string;
            tags?: { language?: string; title?: string };
          }[];
          programs?: {
            program_id?: number; program_num?: number; pmt_pid?: number; pcr_pid?: number;
            tags?: { service_name?: string; service_provider?: string; title?: string };
            streams?: { index: number; codec_type?: string }[];
          }[];
          format?: {
            format_name: string; duration: string; bit_rate: string; nb_programs: number;
            tags?: { service_name?: string; service_provider?: string; title?: string };
          };
        };

        const streams: StreamInfo[] = (data.streams ?? []).map(s => {
          const info: StreamInfo = {
            index: s.index,
            codec: s.codec_name ?? "desconhecido",
            codecNome: s.codec_long_name,
            tipo: s.codec_type === "video" ? "video" : s.codec_type === "audio" ? "audio" : s.codec_type === "data" ? "data" : "outro",
          };
          if (s.id !== undefined) info.id = s.id;
          if (s.codec_type === "video") {
            if (s.width && s.height) info.resolucao = `${s.width}x${s.height}`;
            const fpsStr = s.avg_frame_rate ?? s.r_frame_rate ?? "";
            if (fpsStr && fpsStr !== "0/0") {
              const [n, d] = fpsStr.split("/").map(Number);
              if (d) info.fps = parseFloat((n / d).toFixed(3));
            }
            if (s.bit_rate) info.bitrate = Math.round(parseInt(s.bit_rate) / 1000);
            if (s.profile) info.perfil = s.profile;
            if (s.level) info.nivel = String(s.level);
            if (s.pix_fmt) info.pixelFormat = s.pix_fmt;
          } else if (s.codec_type === "audio") {
            if (s.channels) info.canais = s.channels;
            if (s.sample_rate) info.amostragem = parseInt(s.sample_rate);
            if (s.bit_rate) info.bitrate = Math.round(parseInt(s.bit_rate) / 1000);
          }
          if (s.tags?.language) info.idioma = s.tags.language;
          if (s.tags?.title) info.titulo = s.tags.title;
          return info;
        });

        const fmt = data.format;
        const formato: FormatoInfo | null = fmt ? {
          container: fmt.format_name ?? "desconhecido",
          duracao: parseFloat(fmt.duration ?? "0"),
          bitrateTotalKbps: Math.round(parseInt(fmt.bit_rate ?? "0") / 1000),
          programas: fmt.nb_programs ?? 0,
          titulo: fmt.tags?.title ?? fmt.tags?.service_name,
          provedor: fmt.tags?.service_provider,
        } : null;

        const canais: CanalInfo[] = (data.programs ?? []).map(program => ({
          programaId: program.program_id,
          programaNumero: program.program_num,
          pmtPid: program.pmt_pid,
          pcrPid: program.pcr_pid,
          nome: program.tags?.service_name ?? program.tags?.title,
          provedor: program.tags?.service_provider,
          streams: program.streams?.map(stream => stream.index),
          temVideo: program.streams?.some(stream => stream.codec_type === "video"),
          temAudio: program.streams?.some(stream => stream.codec_type === "audio"),
        }));
        const canal: CanalInfo | null = canais.find(item => item.temVideo && item.nome?.toLowerCase().includes("hd"))
          ?? canais.find(item => item.temVideo)
          ?? canais[0]
          ?? (formato?.titulo || formato?.provedor ? {
          nome: formato.titulo,
          provedor: formato.provedor,
        } : null);

        resolve({ ok: true, conectado: true, streams, formato, canal, canais, erro: null, duracaoProbeMs: Date.now()-t0, url });
      } catch (e) {
        fail(`Erro ao parsear saída do ffprobe: ${String(e)}`);
      }
    });

    proc.on("error", (e) => { clearTimeout(timer); fail(`Falha ao invocar ffprobe: ${e.message}`); });
  });
}

// POST /api/srt/probe — testa uma URL SRT e retorna info dos streams
router.post("/probe", async (req, res) => {
  const { host, port, mode, latencyMs, passphrase, streamId, timeoutMs } = req.body as {
    host: string; port: number; mode?: string; latencyMs?: number;
    passphrase?: string; streamId?: string; timeoutMs?: number;
  };

  if (!host || !port) {
    res.status(400).json({ ok: false, erro: "host e port são obrigatórios" });
    return;
  }

  const url = buildSrtUrl(host, port, mode ?? "caller", latencyMs ?? 120, passphrase, streamId);
  const timeout = Math.min(timeoutMs ?? 8000, 15000);

  const result = await ffprobe(url, timeout);
  res.status(result.ok ? 200 : 502).json(result);
});

// POST /api/srt/probe-url — testa URL SRT já formada
router.post("/probe-url", async (req, res) => {
  const { url, timeoutMs } = req.body as { url: string; timeoutMs?: number };
  if (!url) { res.status(400).json({ ok: false, erro: "url é obrigatória" }); return; }
  const timeout = Math.min(timeoutMs ?? 8000, 15000);
  const result = await ffprobe(url, timeout);
  res.status(result.ok ? 200 : 502).json(result);
});

// POST /api/srt/epg — lê eventos EIT do transporte MPEG-TS.
// O frontend pausa a ponte SRT antes desta chamada para manter uma única
// conexão com a emissora.
router.post("/epg", async (req, res): Promise<void> => {
  const { url, durationSec = 12 } = req.body as { url: string; durationSec?: number };
  if (!url) {
    res.status(400).json({ ok: false, estado: "erro", erro: "url é obrigatória", eventos: [], temEit: false, duracaoMs: 0 });
    return;
  }

  const duration = Math.min(Math.max(Number(durationSec) || 12, 5), 60);
  const startedAt = Date.now();
  const collector = createEitCollector();
  const result = await new Promise<{ ok: boolean; estado: "capturado" | "sem_epg" | "erro"; erro: string | null; eventos: EpgEvent[]; duracaoMs: number }>(resolve => {
    const args = [
      "-hide_banner", "-loglevel", "error",
      "-timeout", "10000000",
      "-i", url,
      "-map", "0:i:18",
      "-c", "copy",
      "-t", String(duration),
      "-f", "data",
      "pipe:1",
    ];
    const proc = spawn("ffmpeg", args, { timeout: (duration + 8) * 1000 });
    let stderr = "";
    let settled = false;
    const finish = (value: { ok: boolean; estado: "capturado" | "sem_epg" | "erro"; erro: string | null; eventos: EpgEvent[] }) => {
      if (settled) return;
      settled = true;
      resolve({ ...value, duracaoMs: Date.now() - startedAt });
    };
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      finish({ ok: true, estado: collector.result().length ? "capturado" : "sem_epg", erro: null, eventos: collector.result() });
    }, (duration + 8) * 1000);
    proc.stdout.on("data", (chunk: Buffer) => collector.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-8000); });
    proc.on("error", error => {
      clearTimeout(timer);
      finish({ ok: false, estado: "erro", erro: `Falha ao invocar ffmpeg: ${error.message}`, eventos: [] });
    });
    proc.on("close", code => {
      clearTimeout(timer);
      const eventos = collector.result();
      if (eventos.length > 0) {
        finish({ ok: true, estado: "capturado", erro: null, eventos });
        return;
      }
      const lower = stderr.toLowerCase();
      if (lower.includes("connection") || lower.includes("timeout") || lower.includes("refused")) {
        finish({ ok: false, estado: "erro", erro: stderr.trim().slice(0, 500) || `Falha na conexão SRT (ffmpeg código ${code})`, eventos: [] });
        return;
      }
      if (code !== 0 && !lower.includes("matches no streams")) {
        finish({ ok: false, estado: "erro", erro: stderr.trim().slice(-1500) || `Falha ao capturar EPG (código ${code})`, eventos: [] });
        return;
      }
      finish({ ok: true, estado: "sem_epg", erro: null, eventos: [] });
    });
  });
  res.status(result.ok ? 200 : 502).json({ ...result, temEit: result.eventos.length > 0 });
});

function streamArgs(url: string, outputDir: string, programId?: number, captureMetadata = false, recordingDirectory?: string) {
  const videoMap = programId !== undefined ? `0:p:${programId}:v:0?` : "0:v:0";
  const audioMap = programId !== undefined ? `0:p:${programId}:a:0?` : "0:a:0?";
  return [
    "-hide_banner", "-loglevel", "info",
    "-fflags", "nobuffer", "-flags", "low_delay",
    ...(captureMetadata ? ["-c:s", "libaribcaption", "-sub_type", "ass", "-caption_encoding", "latin"] : []),
    "-i", url,
    "-map", videoMap, "-map", audioMap,
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-pix_fmt", "yuv420p", "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-f", "hls", "-hls_time", "2", "-hls_list_size", "5",
    "-hls_flags", "delete_segments+append_list+omit_endlist",
    "-hls_segment_filename", join(outputDir, "segment_%05d.ts"),
    join(outputDir, "index.m3u8"),
    ...(recordingDirectory ? ["-map", videoMap, "-map", audioMap, "-map", "0:s?", "-c", "copy", "-f", "segment", "-segment_time", "600", "-reset_timestamps", "1", join(recordingDirectory, `${Date.now()}_%05d.ts`)] : []),
    ...(captureMetadata ? ["-map", "0:i:278", "-c:s", "ass", "-f", "ass", "-flush_packets", "1", join(outputDir, "captions.ass"),
    "-map", "0:i:18", "-c", "copy", "-f", "data", "-flush_packets", "1", join(outputDir, "epg.bin")] : []),
  ];
}

function parseFfmpegInput(stderr: string, selectedProgramId?: number) {
  const canais: CanalInfo[] = [];
  const streams: StreamInfo[] = [];
  let current: CanalInfo | null = null;
  let hasNoProgram = false;
  let container = "mpegts";
  let parsingInput = true;

  for (const line of stderr.split("\n")) {
    const inputMatch = line.match(/Input #\d+,\s*([^,\s]+)/i);
    if (inputMatch) container = inputMatch[1].toLowerCase();
    if (/^\s*Output #\d+/i.test(line)) {
      parsingInput = false;
      continue;
    }

    const programMatch = line.match(/^\s*Program\s+(\d+)/);
    if (programMatch) {
      current = {
        programaId: Number(programMatch[1]),
        programaNumero: Number(programMatch[1]),
        streams: [],
        temVideo: false,
        temAudio: false,
      };
      canais.push(current);
      hasNoProgram = false;
      continue;
    }
    if (/^\s*No Program\b/.test(line)) {
      current = null;
      hasNoProgram = true;
      continue;
    }
    if (!parsingInput) continue;
    if (current) {
      const serviceName = line.match(/service_name\s*:\s*(.+?)\s*$/i);
      const serviceProvider = line.match(/service_provider\s*:\s*(.+?)\s*$/i);
      if (serviceName) current.nome = serviceName[1];
      if (serviceProvider) current.provedor = serviceProvider[1];
    }

    const streamMatch = line.match(/Stream #0:(\d+)(?:\[(0x[0-9a-f]+)\])?:\s+(Video|Audio|Subtitle|Data):\s+([^,(]+)/i);
    if (!streamMatch) continue;
    const index = Number(streamMatch[1]);
    const typeName = streamMatch[3].toLowerCase();
    const tipo: StreamInfo["tipo"] = typeName === "video" ? "video" : typeName === "audio" ? "audio" : typeName === "data" ? "data" : "outro";
    const language = line.match(/\(([a-z]{3}(?:-[A-Z]{2})?)\)/);
    const info: StreamInfo = {
      index,
      id: streamMatch[2] ? Number.parseInt(streamMatch[2], 16) : undefined,
      codec: streamMatch[4].trim().split(/\s+/)[0],
      tipo,
      codecNome: line.slice(line.indexOf(`${streamMatch[3]}:`) + streamMatch[3].length + 1).trim(),
    };
    if (language) info.idioma = language[1];
    const bitrate = line.match(/(\d+)\s*(?:kbits?|kb)\/s/i);
    if (bitrate) info.bitrate = Number(bitrate[1]);
    if (tipo === "video") {
      const resolution = line.match(/(\d{3,5}x\d{3,5})/);
      const fps = line.match(/(\d+(?:\.\d+)?)\s+fps/i);
      if (resolution) info.resolucao = resolution[1];
      if (fps) info.fps = Number(fps[1]);
    }
    if (tipo === "audio") {
      const sampleRate = line.match(/(\d{4,6})\s*Hz/i);
      if (sampleRate) info.amostragem = Number(sampleRate[1]);
      if (/\bstereo\b/i.test(line)) info.canais = 2;
      else {
        const channelCount = line.match(/(\d+)\s+channels?/i);
        if (channelCount) info.canais = Number(channelCount[1]);
      }
    }
    streams.push(info);
    if (current && !hasNoProgram) {
      current.streams?.push(index);
      if (tipo === "video") current.temVideo = true;
      if (tipo === "audio") current.temAudio = true;
    }
  }

  const firstVideo = streams.find(stream => stream.tipo === "video");
  // The bridge maps 0:v:0. Select the program that owns that stream so the
  // channel shown in the UI always describes the video actually being played.
  const canal = (selectedProgramId !== undefined ? canais.find(item => item.programaId === selectedProgramId && item.temVideo) : undefined)
    ?? (firstVideo && canais.find(item => item.streams?.includes(firstVideo.index)))
    ?? canais.find(item => item.temVideo && item.nome?.toLowerCase().includes("hd"))
    ?? canais.find(item => item.temVideo)
    ?? canais[0]
    ?? null;
  const formato: FormatoInfo = {
    container,
    duracao: 0,
    bitrateTotalKbps: 0,
    programas: canais.length,
    titulo: canal?.nome,
    provedor: canal?.provedor,
  };

  return { canais, streams, formato, canal };
}

async function waitForManifest(path: string, process: ReturnType<typeof spawn>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) return false;
    try {
      await access(path);
      return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  return false;
}

async function stopStream(id: string) {
  const session = streamSessions.get(id);
  if (!session) return;
  streamSessions.delete(id);
  if (!session.process.killed) session.process.kill("SIGTERM");
  setTimeout(() => {
    if (!session.process.killed) session.process.kill("SIGKILL");
  }, 2500);
  await rm(session.dir, { recursive: true, force: true }).catch(() => undefined);
}

// O navegador não reproduz srt:// diretamente; HLS é a ponte compatível com o PWV.
router.use("/stream", express.static(streamRoot, {
  fallthrough: true,
  setHeaders(res, filePath) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", filePath.endsWith(".m3u8") ? "no-cache, no-store" : "public, max-age=2");
    if (filePath.endsWith(".m3u8")) res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    if (filePath.endsWith(".ts")) res.setHeader("Content-Type", "video/mp2t");
  },
}));

// POST /api/srt/stream — inicia uma ponte SRT para reprodução no navegador
router.post("/stream", async (req, res): Promise<void> => {
  const { host, port, mode, latencyMs, passphrase, streamId, programId, captureMetadata, recordingDirectory } = req.body as {
    host: string; port: number; mode?: string; latencyMs?: number; passphrase?: string; streamId?: string; programId?: number; captureMetadata?: boolean; recordingDirectory?: string;
  };
  if (!host || !Number.isInteger(Number(port)) || Number(port) <= 0 || Number(port) > 65535) {
    res.status(400).json({ ok: false, erro: "host e uma porta válida são obrigatórios" });
    return;
  }

  if (recordingDirectory) {
    if (!isAbsolute(recordingDirectory)) { res.status(400).json({ ok: false, erro: "Escolha uma pasta absoluta no HD." }); return; }
    try { await mkdir(recordingDirectory, { recursive: true }); } catch { res.status(400).json({ ok: false, erro: "Não foi possível acessar a pasta de gravação." }); return; }
  }
  await mkdir(streamRoot, { recursive: true });
  const id = randomUUID();
  const outputDir = join(streamRoot, id);
  await mkdir(outputDir, { recursive: true });
  const url = buildSrtUrl(host, Number(port), mode ?? "caller", Number(latencyMs) || 120, passphrase, streamId);
  const selectedProgramId = programId !== undefined && programId !== null && Number.isInteger(Number(programId))
    ? Number(programId)
    : undefined;
  const proc = spawn("ffmpeg", streamArgs(url, outputDir, selectedProgramId, captureMetadata === true, recordingDirectory), { stdio: ["ignore", "ignore", "pipe"] });
  const session: StreamSession = { id, dir: outputDir, process: proc, createdAt: Date.now(), lastError: null };
  streamSessions.set(id, session);

  let stderr = "";
  proc.stderr?.on("data", (data: Buffer) => { stderr = `${stderr}${data.toString()}`.slice(-20000); });
  proc.on("error", error => {
    session.lastError = error.message.slice(-1000);
    logger.warn({ streamId: id, err: error.message }, "SRT playback bridge failed to start");
  });
  proc.on("close", code => {
    if (code !== 0 && streamSessions.has(id)) {
      session.lastError = stderr || `ffmpeg encerrou com código ${code}`;
      logger.warn({ streamId: id, code, error: session.lastError }, "SRT playback bridge stopped");
    }
  });

  // Evita que uma aba abandonada mantenha um decoder ativo indefinidamente.
  setTimeout(() => { void stopStream(id); }, 30 * 60 * 1000);

  const ready = await waitForManifest(join(outputDir, "index.m3u8"), proc, 10000);
  if (!ready) {
    const error = session.lastError ?? (stderr.trim() || "O SRT não entregou um vídeo MPEG-TS dentro de 10 segundos.");
    await stopStream(id);
    res.status(502).json({ ok: false, erro: error });
    return;
  }

  const parsed = parseFfmpegInput(stderr, selectedProgramId);
  res.status(201).json({
    ok: true,
    streamId: id,
    playbackUrl: `/api/srt/stream/${id}/index.m3u8`,
    url,
    status: "ready",
    streams: parsed.streams,
    formato: parsed.formato,
    canal: parsed.canal,
    canais: parsed.canais,
    erro: null,
    conectado: true,
    duracaoProbeMs: Date.now() - session.createdAt,
  });
});

router.get("/stream/:id/metadata", async (req, res): Promise<void> => {
  const session = streamSessions.get(String(req.params.id));
  if (!session) { res.status(404).json({ ok: false }); return; }
  const [captions, epg] = await Promise.all([
    readFile(join(session.dir, "captions.ass"), "utf8").catch(() => ""),
    readFile(join(session.dir, "epg.bin")).catch(() => Buffer.alloc(0)),
  ]);
  const collector = createEitCollector();
  collector.push(epg);
  res.json({ ok: true, captionRevision: captions.length, linhas: parseAssDialogue(captions, false).slice(-30), eventos: collector.result(), erro: session.lastError });
});

router.get("/stream/:id/status", (req, res): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const session = streamSessions.get(id);
  if (!session) {
    res.status(404).json({ ok: false, status: "not_found" });
    return;
  }
  res.json({
    ok: true,
    status: session.process.exitCode === null ? "running" : "stopped",
    ready: session.process.exitCode === null,
    erro: session.lastError,
    ageMs: Date.now() - session.createdAt,
  });
});

router.delete("/stream/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await stopStream(id);
  res.status(204).send();
});

// GET /api/srt/formats — retorna codecs e formatos suportados pelo ffmpeg local
router.get("/formats", (_req, res) => {
  const proc = spawn("ffprobe", ["-v", "quiet", "-formats"], { timeout: 5000 });
  let out = "";
  proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
  proc.stderr.on("data", (d: Buffer) => { out += d.toString(); });
  proc.on("close", () => {
    const srtSupported = out.toLowerCase().includes("srt") || out.toLowerCase().includes("libsrt");
    res.json({ srtSupported, raw: out.slice(0, 500) });
  });
  proc.on("error", () => res.json({ srtSupported: false, raw: "" }));
});

export default router;






