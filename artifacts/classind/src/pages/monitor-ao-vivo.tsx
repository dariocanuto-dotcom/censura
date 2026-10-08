import { MonitorWorkspace } from "@/components/monitor-workspace";
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Monitor, Mic2, ChevronDown, Circle, Settings, Scissors, Database,
  RefreshCw, Square, Play, LayoutDashboard, Bell, BellOff, AlertTriangle,
  CheckCircle2, X, Send, Plus, Pencil, Trash2, Cpu, Wifi, Globe, Signal,
  Radio, Loader2, ServerCog, HardDrive, FileText, FolderOpen, Save, Activity,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import Hls from "hls.js";

// ─── Sistema ──────────────────────────────────────────────────────────────────

const SISTEMA = "DC CENSURA PRO";
const AUTOR = "Engenheiro Dário Canuto";
const SISTEMA_FULL = `${SISTEMA} - ${AUTOR}`;

const CC_LINES = [
  `${SISTEMA_FULL} — Monitoramento de Broadcast`,
  "[Música instrumental ao fundo]",
  "Este conteúdo é classificado para maiores de 14 anos.",
  "Contém cenas de violência moderada e linguagem imprópria.",
  "[Apresentador] Boa noite, bem-vindos ao noticiário.",
  `${SISTEMA} — Sistema de Monitoramento Contínuo de Broadcast`,
  "Classificação Indicativa — Portaria nº 368/2014 MJ / Anatel",
  "[Música: tema de abertura]",
  "Sistema de Closed Caption — CEA-708 / ABNT NBR 15606-3",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface BmdDevice {
  id: string; deviceName: string; modelName: string; vendorName: string;
  topologicalId: number; persistentId: string; connectors: string[];
  numPorts: number; linkMode: string[];
  supportedVideoModes: { name: string; frameRate: string; resolution: string; interlaced: boolean; pixelFormat: string }[];
  audioChannels: number[]; signalPresent: boolean; firmwareVersion: string; driverVersion: string;
}

interface SdiConfig { deviceId: string; deviceName: string; portIndex: number; videoFormat: string; audioChannels: number; linkMode: string }
interface SrtConfig { host: string; port: number; latencyMs: number; passphrase: string; mode: "caller" | "listener"; streamId: string }
interface UdpConfig { address: string; port: number; interface: string; bufferSize: number; protocol: "udp" | "rtp" }
interface EpgEvent {
  eventId: number; serviceId: number; tableId: number; version: number; sectionNumber: number;
  title: string; description: string; startTime: string | null; durationSec: number;
}

interface SignalSource {
  id: string; nome: string; tipo: "sdi" | "srt" | "udp"; ativo: boolean;
  sdi?: SdiConfig; srt?: SrtConfig; udp?: UdpConfig;
}

type ScopeTab = "waveform" | "vectorscope" | "histogram" | "bts";
type BtsTab = "PAT" | "PMT" | "SDT" | "NIT" | "EIT";
type AlertTipo = "video" | "audio" | "closed_caption" | "loudness" | "sinal";
type AlertStatus = "pendente" | "enviando" | "enviado" | "erro";

interface AlertEntry { id: string; tipo: AlertTipo; titulo: string; mensagem: string; hora: string; status: AlertStatus; canais: string[]; erros: string[] }
interface RecordingBlock { index: number; start: string; durationSec: number; sizeMB: number; codec: string; done: boolean }
type AuditStatus = "ok" | "erro" | "atencao" | "aguardando";
interface BtsAuditCheck { id: "video" | "audio" | "closed_caption" | "loudness"; label: string; status: AuditStatus; detalhe: string }
interface ReportDirectoryHandle {
  name: string;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<"granted" | "denied" | "prompt">;
  getFileHandle: (name: string, options: { create: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }>;
  }>;
}
interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<ReportDirectoryHandle>;
}
interface Config {
  codec: string; bitrate: string; container: string; audioFormat: string; audioChannels: string;
  ccLang: string; ccFormat: string; outputPath: string; blockDurationMin: number;
  notifyVideoLoss: boolean; notifyAudioLoss: boolean; notifyCCLoss: boolean; notifyLoudnessLoss: boolean;
  telegramToken: string; telegramChatId: string;
  whatsappWebhookUrl: string; whatsappNumero: string; whatsappToken: string;
  whatsappProvider: "z-api" | "ultraMsg" | "callmebot" | "webhook";
}

// ─── Default Sources ──────────────────────────────────────────────────────────

const DEFAULT_SOURCES: SignalSource[] = [
  { id: "sdi-1", nome: "SDI 1 — Câmera Principal", tipo: "sdi", ativo: true,
    sdi: { deviceId: "bmd-0001", deviceName: "DeckLink Mini Recorder 4K", portIndex: 1, videoFormat: "HD 1080i 59.94", audioChannels: 16, linkMode: "single" } },
  { id: "sdi-2", nome: "SDI 2 — Câmera Reserva", tipo: "sdi", ativo: true,
    sdi: { deviceId: "bmd-0002", deviceName: "DeckLink Duo 2", portIndex: 2, videoFormat: "HD 1080i 50", audioChannels: 16, linkMode: "single" } },
  { id: "srt-1", nome: "SRT — Emissora 45.176.168.146", tipo: "srt", ativo: true,
    srt: { host: "45.176.168.146", port: 40091, latencyMs: 120, passphrase: "", mode: "caller", streamId: "" } },
  { id: "udp-1", nome: "UDP — Satélite / Multicast", tipo: "udp", ativo: true,
    udp: { address: "239.1.1.1", port: 1234, interface: "0.0.0.0", bufferSize: 1500000, protocol: "udp" } },
];

const DEFAULT_CONFIG: Config = {
  codec: "ProRes 422 HQ", bitrate: "35 Mbps", container: "MXF (OP1a)",
  audioFormat: "PCM 48kHz/24-bit", audioChannels: "8 (4 pares AES/EBU)",
  ccLang: "Português (por)", ccFormat: "CEA-708 (DTVCC)",
  outputPath: "/media/gravacoes/", blockDurationMin: 10,
  notifyVideoLoss: true, notifyAudioLoss: true, notifyCCLoss: true, notifyLoudnessLoss: true,
  telegramToken: "", telegramChatId: "",
  whatsappWebhookUrl: "", whatsappNumero: "", whatsappToken: "", whatsappProvider: "webhook",
};

// ─── localStorage hooks ───────────────────────────────────────────────────────

function usePersistentSources() {
  const [sources, setSources] = useState<SignalSource[]>(() => {
    try {
      const stored = localStorage.getItem("dccp-sources");
      if (stored) {
        const parsed: SignalSource[] = JSON.parse(stored);
        const updated = parsed.map((source) =>
          source.id === "srt-1" && source.srt?.host === "45.176.168.146" && source.srt.port === 40204
            ? { ...source, srt: { ...source.srt, port: 40091 } }
            : source,
        );
        localStorage.setItem("dccp-sources", JSON.stringify(updated));
        return updated;
      }
    } catch {}
    return DEFAULT_SOURCES;
  });
  const save = (s: SignalSource[]) => { setSources(s); localStorage.setItem("dccp-sources", JSON.stringify(s)); };
  return { sources, save };
}

function formatCaptionLines(lines: string[], limit = 100): string[] {
  return lines.flatMap(text => {
    const output: string[] = [];
    let line = "";
    for (const word of text.trim().split(/\s+/u)) {
      if (line && Array.from(`${line} ${word}`).length > limit) {
        output.push(line);
        line = "";
      }
      const chars = Array.from(word);
      while (chars.length > limit) {
        output.push(chars.splice(0, limit).join(""));
      }
      const remainder = chars.join("");
      line = line ? `${line} ${remainder}` : remainder;
    }
    if (line) output.push(line);
    return output;
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BLOCK_SEC = 10 * 60;
function pad(n: number, d = 2) { return String(Math.floor(n)).padStart(d, "0"); }
function smpteTC(date: Date, fps: number) { const h=date.getHours(),m=date.getMinutes(),s=date.getSeconds(),f=Math.floor((date.getMilliseconds()/1000)*fps); return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`; }
function fmtDur(sec: number) { return `${pad(Math.floor(sec/60))}:${pad(sec%60)}`; }
function fmtEpgDuration(sec: number) { return `${pad(Math.floor(sec/3600))}:${pad(Math.floor((sec%3600)/60))}:${pad(sec%60)}`; }
function nowStr() { return new Date().toLocaleTimeString("pt-BR"); }
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function dbToH(db: number) { return Math.max(0,Math.min(1,(db+60)/60)); }
function dbColor(db: number) { if (db>=-1) return "#ef4444"; if (db>=-6) return "#f97316"; if (db>=-18) return "#22c55e"; return "#3b82f6"; }
function auditColor(status: AuditStatus) {
  return status === "ok" ? "text-teal-400" : status === "erro" ? "text-red-400" : status === "atencao" ? "text-amber-400" : "text-gray-500";
}
function auditLabel(status: AuditStatus) {
  return status === "ok" ? "OK" : status === "erro" ? "FALHA" : status === "atencao" ? "ATENÇÃO" : "AGUARDANDO";
}
function fileStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}
function downloadTextFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function srcProtocol(s: SignalSource) {
  if (s.tipo==="sdi") return s.sdi?.deviceName?.split(" ")[0]??"SDI";
  if (s.tipo==="srt") return `SRT ${s.srt?.mode??"caller"}`;
  return `UDP ${s.udp?.protocol?.toUpperCase()??"UDP"}`;
}
function srcResolution(s: SignalSource) {
  if (s.tipo==="sdi") return s.sdi?.videoFormat??"—";
  if (s.tipo==="srt") return `${s.srt?.host??""}\:${s.srt?.port??""}`;
  return `${s.udp?.address??""}\:${s.udp?.port??""}`;
}
function srcFps(s: SignalSource): number {
  if (s.tipo==="sdi") { const f=parseFloat(s.sdi?.videoFormat?.split(" ").pop()??"29.97"); return isNaN(f)?29.97:f; }
  if (s.tipo==="srt") return 29.97;
  return 25;
}

// ─── Notification API ─────────────────────────────────────────────────────────

async function enviarNotificacao(tipo: AlertTipo, titulo: string, mensagem: string, fonte: string, cfg: Config) {
  const body: Record<string, unknown> = { tipo, titulo, mensagem, fonte, severidade: "critico" };
  if (cfg.telegramToken && cfg.telegramChatId) body.telegram = { token: cfg.telegramToken, chatId: cfg.telegramChatId };
  if (cfg.whatsappWebhookUrl && cfg.whatsappNumero) body.whatsapp = { webhookUrl: cfg.whatsappWebhookUrl, numero: cfg.whatsappNumero, token: cfg.whatsappToken||undefined, provider: cfg.whatsappProvider };
  if (!body.telegram && !body.whatsapp) return { canais: [], erros: ["Nenhum canal configurado"] };
  try {
    const res = await fetch("/api/notificacoes/enviar", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const data = await res.json() as { resultados: { canal:string; ok:boolean; erro?:string }[] };
    return { canais: data.resultados.filter(r=>r.ok).map(r=>r.canal), erros: data.resultados.filter(r=>!r.ok).map(r=>`${r.canal}: ${r.erro??""}`)} ;
  } catch (e) { return { canais: [], erros: [String(e)] }; }
}

// ─── SMPTE Canvas ─────────────────────────────────────────────────────────────

const SMPTE_BARS = [[192,192,192],[192,192,0],[0,192,192],[0,192,0],[192,0,192],[192,0,0],[0,0,192]];
const SMPTE_LOWER = [[0,0,192],[20,20,20],[192,0,192],[20,20,20],[0,192,192],[20,20,20],[192,192,192]];

function ColorBarCanvas({ active, recording }: { active: boolean; recording: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c=ref.current; if (!c) return; const ctx=c.getContext("2d"); if (!ctx) return;
    const w=c.width, h=c.height;
    if (!active) {
      ctx.fillStyle="#000"; ctx.fillRect(0,0,w,h);
      ctx.fillStyle="#555"; ctx.font="bold 20px monospace"; ctx.textAlign="center"; ctx.fillText("SEM SINAL",w/2,h/2-14);
      ctx.font="12px monospace"; ctx.fillStyle="#3a3a3a"; ctx.fillText("Sinal de vídeo interrompido",w/2,h/2+8);
      ctx.font="11px monospace"; ctx.fillStyle="#2a2a2a"; ctx.fillText(SISTEMA_FULL,w/2,h/2+28);
      return;
    }
    const topH=h*0.75;
    SMPTE_BARS.forEach(([r,g,b],i)=>{ ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect((i/7)*w,0,w/7+1,topH); });
    SMPTE_LOWER.forEach(([r,g,b],i)=>{ ctx.fillStyle=`rgb(${r},${g},${b})`; ctx.fillRect((i/7)*w,topH,w/7+1,h-topH); });
    const n=ctx.createLinearGradient(0,0,0,h); n.addColorStop(0,"rgba(0,0,0,0.02)"); n.addColorStop(1,"rgba(0,0,0,0.12)");
    ctx.fillStyle=n; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="rgba(255,255,255,0.25)"; ctx.lineWidth=1; ctx.setLineDash([4,4]);
    ctx.strokeRect(w*0.1,h*0.1,w*0.8,h*0.8); ctx.setLineDash([]);
    ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(w/2-14,h/2); ctx.lineTo(w/2+14,h/2); ctx.moveTo(w/2,h/2-14); ctx.lineTo(w/2,h/2+14); ctx.stroke();
    if (recording) { ctx.strokeStyle="#ef4444"; ctx.lineWidth=4; ctx.strokeRect(2,2,w-4,h-4); }
  }, [active, recording]);
  return <canvas ref={ref} width={640} height={360} className="w-full h-full object-cover" data-testid="canvas-bars"/>;
}

function SrtVideo({ src, active, onStateChange, onAudioAnalysis }: {
  src: string | null;
  active: boolean;
  onStateChange: (state: "connecting" | "playing" | "error") => void;
  onAudioAnalysis: (levels: number[], rmsDb: number, peakDb: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !active || !window.AudioContext) return;

    let context: AudioContext | null = null;
    let mediaSource: MediaElementAudioSourceNode | null = null;
    let splitter: ChannelSplitterNode | null = null;
    let analysers: AnalyserNode[] = [];
    let timer: number | null = null;

    try {
      context = new AudioContext();
      mediaSource = context.createMediaElementSource(video);
      splitter = context.createChannelSplitter(8);
      mediaSource.connect(splitter);
      analysers = Array.from({ length: 8 }, () => {
        const analyser = context!.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.65;
        return analyser;
      });
      analysers.forEach((analyser, index) => splitter!.connect(analyser, index));

      const measure = () => {
        const levels = analysers.map(analyser => {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          let peak = 0;
          samples.forEach(sample => {
            sum += sample * sample;
            peak = Math.max(peak, Math.abs(sample));
          });
          const rms = Math.sqrt(sum / samples.length);
          return Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(rms, 0.001))));
        });
        const power = levels.reduce((total, level) => total + Math.pow(10, level / 10), 0) / Math.max(levels.length, 1);
        const peakDb = Math.max(...levels);
        onAudioAnalysis(levels, Math.max(-60, Math.min(0, 10 * Math.log10(Math.max(power, 0.000001)))), peakDb);
      };

      timer = window.setInterval(measure, 250);
      const resume = () => { void context?.resume(); };
      video.addEventListener("playing", resume);
      if (!video.paused) resume();

      return () => {
        if (timer !== null) window.clearInterval(timer);
        video.removeEventListener("playing", resume);
        analysers.forEach(analyser => analyser.disconnect());
        splitter?.disconnect();
        mediaSource?.disconnect();
        void context?.close();
      };
    } catch {
      // A browser may reject a second MediaElementAudioSource for the same video.
      // The video remains usable; the report will mark loudness as unavailable.
      return () => {
        if (timer !== null) window.clearInterval(timer);
        void context?.close();
      };
    }
  }, [src, active, onAudioAnalysis]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src || !active) return;
    let hls: Hls | null = null;
    onStateChange("connecting");

    const play = () => {
      void video.play().catch(() => undefined);
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 2,
        backBufferLength: 30,
        manifestLoadingMaxRetry: 12,
        levelLoadingMaxRetry: 12,
        fragLoadingMaxRetry: 12,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
        else onStateChange("error");
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", play, { once: true });
    } else {
      onStateChange("error");
    }

    const playing = () => onStateChange("playing");
    const error = () => onStateChange("error");
    video.addEventListener("playing", playing);
    video.addEventListener("error", error);
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.removeEventListener("playing", playing);
      video.removeEventListener("error", error);
      hls?.destroy();
    };
  }, [src, active, onStateChange]);

  return (
    <video
      ref={videoRef}
      className="absolute inset-0 w-full h-full object-cover bg-black"
      autoPlay
      muted
      playsInline
      controls
      data-testid="srt-video"
    />
  );
}

// ─── VU Meter ─────────────────────────────────────────────────────────────────

function VUMeter({ ch, db, peak }: { ch:number; db:number; peak:number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1" data-testid={`vu-${ch}`}>
      <div className="relative w-full bg-[#111] rounded-sm overflow-hidden" style={{ height:110 }}>
        {[-60,-40,-18,-6,0].map(t=><div key={t} className="absolute w-full border-t border-gray-800" style={{ bottom:`${dbToH(t)*100}%` }}/>)}
        <div className="absolute bottom-0 w-full transition-none rounded-sm" style={{ height:`${dbToH(db)*100}%`, background:dbColor(db) }}/>
        <div className="absolute w-full border-t-2 border-white/50" style={{ bottom:`${dbToH(peak)*100}%` }}/>
      </div>
      <span className="text-[9px] font-mono text-gray-400">{ch<=2?(ch===1?"L":"R"):`C${ch}`}</span>
      <span className="text-[8px] font-mono text-gray-600">{db.toFixed(0)}</span>
    </div>
  );
}

// ─── Scope ────────────────────────────────────────────────────────────────────

function ScopeCanvas({ type, tick }: { type:"waveform"|"vectorscope"|"histogram"; tick:number }) {
  const ref=useRef<HTMLCanvasElement>(null); const seed=useRef(Math.random()*1000);
  useEffect(()=>{
    const c=ref.current; if (!c) return; const ctx=c.getContext("2d"); if (!ctx) return;
    const w=c.width, h=c.height; ctx.fillStyle="#0a0a0a"; ctx.fillRect(0,0,w,h);
    const t=tick*0.04+seed.current;
    ctx.strokeStyle="#1a2030"; ctx.lineWidth=1;
    if (type==="waveform") {
      for (let y=0;y<=4;y++) { ctx.beginPath(); ctx.moveTo(0,(y/4)*h); ctx.lineTo(w,(y/4)*h); ctx.stroke(); }
      ctx.fillStyle="#374151"; ctx.font="9px monospace"; ctx.fillText("100%",4,10); ctx.fillText("0%",4,h-3);
      ctx.strokeStyle="#22c55e"; ctx.lineWidth=1.5; ctx.shadowColor="#22c55e"; ctx.shadowBlur=3;
      ctx.beginPath();
      for (let x=0;x<w;x++) { const nx=x/w; const luma=0.55+0.25*Math.sin(nx*12+t)+0.1*Math.sin(nx*35+t*1.3)+0.05*Math.sin(nx*80+t*0.7); x===0?ctx.moveTo(x,(1-luma)*h):ctx.lineTo(x,(1-luma)*h); }
      ctx.stroke(); ctx.shadowBlur=0;
    } else if (type==="vectorscope") {
      for (let r=1;r<=3;r++) { ctx.beginPath(); ctx.arc(w/2,h/2,(r/3)*(Math.min(w,h)/2-4),0,Math.PI*2); ctx.stroke(); }
      const cx=w/2, cy=h/2, rad=Math.min(w,h)/2-10;
      [["W",0,"#aaa"],["G",2,"#22c55e"],["B",4,"#3b82f6"],["R",8,"#ef4444"],["Y",10,"#eab308"],["Cy",6,"#06b6d4"]].forEach(([l,s,color])=>{
        const angle=-Math.PI/2+(Number(s)/12)*Math.PI*2; const mx=cx+Math.cos(angle)*rad*0.82, my=cy+Math.sin(angle)*rad*0.82;
        ctx.fillStyle=String(color); ctx.fillRect(mx-3,my-3,6,6);
        ctx.fillStyle="#6b7280"; ctx.font="9px monospace"; ctx.fillText(String(l),mx+6,my+4);
      });
      for (let i=0;i<300;i++) { const angle=(i/300)*Math.PI*2+Math.sin(t*0.1+i)*0.18; const r=(0.3+0.35*Math.abs(Math.sin(i*0.15+t*0.05)))*rad; ctx.fillStyle="rgba(0,255,120,0.32)"; ctx.fillRect(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r,1.5,1.5); }
    } else {
      for (let x=0;x<=4;x++) { ctx.beginPath(); ctx.moveTo((x/4)*w,0); ctx.lineTo((x/4)*w,h); ctx.stroke(); }
      ctx.fillStyle="#374151"; ctx.font="9px monospace"; ctx.fillText("0",2,h-2); ctx.fillText("255",w-22,h-2);
      for (let i=0;i<64;i++) { const nx=i/64; const intensity=0.6*Math.exp(-((nx-0.55)**2)/0.06)+0.25*Math.exp(-((nx-0.3)**2)/0.03)+0.08*Math.abs(Math.sin(nx*20+t*0.3)); const bh=intensity*(h-10); const g=ctx.createLinearGradient(0,h-bh,0,h); g.addColorStop(0,"rgba(250,204,21,0.9)"); g.addColorStop(1,"rgba(34,197,94,0.6)"); ctx.fillStyle=g; ctx.fillRect(i*(w/64)+0.5,h-bh,(w/64)-1,bh); }
    }
  }, [type, tick]);
  return <canvas ref={ref} width={220} height={120} className="w-full h-full" data-testid={`scope-${type}`}/>;
}

// ─── BTS Tables ───────────────────────────────────────────────────────────────

function BtsTables({ source, epgEvents, epgLoading, epgError, onReadEpg }: {
  source: SignalSource;
  epgEvents: EpgEvent[];
  epgLoading: boolean;
  epgError: string | null;
  onReadEpg: () => void;
}) {
  const [tab, setTab] = useState<BtsTab>("PAT");
  const isSDI=source.tipo==="sdi"; const netId=isSDI?"0x0006":"0x0020"; const tsId=isSDI?"0x0001":"0x0002";
  const epgRows: string[][] = epgLoading
    ? [["Status", "Lendo EIT do transporte…", "—", "Capturando a tabela de eventos da entrada"]]
    : epgError
      ? [["Status", "Erro", "—", epgError]]
      : epgEvents.length === 0
        ? [["Status", "Sem EIT detectado", "—", "Nenhum evento foi encontrado no período capturado"]]
        : epgEvents.flatMap(event => [
          [`Evento ${event.eventId}`, "", "", ""],
          ["Service ID", `0x${event.serviceId.toString(16).padStart(4, "0").toUpperCase()}`, "uint16", "Serviço associado"],
          ["Nome", event.title, "UTF-8/ARIB", "Título do evento"],
          ["Início", event.startTime ? new Date(event.startTime).toLocaleString("pt-BR") : "—", "UTC", "Data e hora informadas pela EIT"],
          ["Duração", event.durationSec ? fmtEpgDuration(event.durationSec) : "—", "hh:mm:ss", "Duração do evento"],
          ...(event.description ? [["Descrição", event.description, "texto", "Descrição estendida"]] : []),
        ]);
  const tables: Record<BtsTab,{pid:string;tableId:string;version:string;section:string;rows:string[][]}> = {
    PAT:{pid:"0x0000 (0)",tableId:"0x00",version:"3",section:"0/0",rows:[["Program 0 (NIT)","0x0010","—","Network Information Table"],["Program 1 (PMT)","0x0100","—","Programa Principal"],["Program 2 (PMT)","0x0200","—","Áudio Descrição"]]},
    PMT:{pid:"0x0100 (256)",tableId:"0x02",version:"5",section:"0/0",rows:[["PCR PID","0x03E9","—","Clock de referência"],["Vídeo H.264","0x03E9","0x1B","AVC / MPEG-4 Part 10"],["Áudio AAC","0x03EA","0x0F","ISO 13818-7 — Português"],["Áudio AAC AD","0x03EB","0x0F","Audiodescrição — LBI"],["Closed Caption","0x03EC","0x05","CEA-708 / NBR 15606-3"],["Legenda SRT","0x03ED","0x06","Subtitling — Português"],["Data Service","0x03EE","0x0B","DSM-CC"]]},
    SDT:{pid:"0x0011 (17)",tableId:"0x42",version:"2",section:"0/0",rows:[["Service ID","0x0001","—","Identificador do serviço"],["Service Type","0x01","—","Televisão Digital"],["Service Name",SISTEMA,"—","Nome do sistema"],["Provider Name",AUTOR,"—","Responsável técnico"],["EIT Present","Sim","—","Tabela EIT presente"],["Running Status","0x04","—","On air"],["Free CA Mode","0x00","—","Acesso livre"]]},
    NIT:{pid:"0x0010 (16)",tableId:"0x40",version:"7",section:"0/0",rows:[["Network ID",netId,"—","ID da rede ISDB-Tb"],["TS ID",tsId,"—","Transport Stream ID"],["Orig. Network ID","0x0001 (Brasil/ABNT)","—","Operadora"],["Frequência","527 MHz (CH 29)","—","UHF Digital"],["Modulação","OFDM 64-QAM","—","ISDB-Tb"],["Segmentos","13 + 1 One-Seg","—","Full-HD + mobile"],["Guard Interval","1/8","—","Intervalo de guarda"],["Bandwidth","6 MHz","—","Largura de banda"],["FEC","3/4 Viterbi+RS","—","Forward Error Correction"],["Country Code","BRA","—","ABNT NBR 15604"]]},
    EIT:{pid:"0x0012 (18)",tableId:epgEvents[0] ? `0x${epgEvents[0].tableId.toString(16).padStart(2, "0").toUpperCase()}` : "0x4E",version:epgEvents[0] ? String(epgEvents[0].version) : "—",section:epgEvents[0] ? `${epgEvents[0].sectionNumber}/—` : "—",rows:epgRows},
  };
  const cur=tables[tab];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0.5 border-b border-[#1e2332] px-1 pt-1">
        {(["PAT","PMT","SDT","NIT","EIT"] as BtsTab[]).map(t=>(
          <button key={t} onClick={()=>setTab(t)} data-testid={`bts-${t}`}
            className={`px-3 py-1 text-[11px] font-mono font-semibold rounded-t transition-colors ${tab===t?"bg-[#111827] text-teal-400 border-b-2 border-teal-400":"text-gray-500 hover:text-gray-300"}`}>{t}</button>
        ))}
        <div className="flex-1"/>
        {tab==="EIT"&&<button onClick={onReadEpg} disabled={epgLoading||isSDI} className="flex items-center gap-1 text-[10px] font-mono text-teal-400 hover:text-teal-300 disabled:text-gray-600 pb-1 pr-3" data-testid="btn-read-epg">
          {epgLoading?<Loader2 className="h-3 w-3 animate-spin"/>:<RefreshCw className="h-3 w-3"/>}Ler EPG real
        </button>}
        <span className="text-[10px] font-mono text-gray-600 pb-1 pr-2">ISDB-Tb · ABNT NBR 15606-3</span>
      </div>
      <div className="flex items-center gap-4 bg-[#0d111a] px-3 py-1 border-b border-[#1e2332] flex-wrap">
        {[["PID",cur.pid],["Table ID",cur.tableId],["Versão",cur.version],["Seção",cur.section]].map(([l,v])=>(
          <div key={l} className="flex items-center gap-1"><span className="text-[10px] text-gray-600">{l}:</span><span className="text-[10px] font-mono text-teal-400">{v}</span></div>
        ))}
      </div>
      <ScrollArea className="flex-1">
        <table className="w-full text-[11px] font-mono">
          <thead><tr className="border-b border-[#1e2332]">{["Campo","Valor","Tipo","Descrição"].map(h=><th key={h} className="text-left text-gray-500 font-medium px-3 py-1">{h}</th>)}</tr></thead>
          <tbody>{cur.rows.map(([f,v,t,d],i)=>(
            <tr key={i} className={`border-b border-[#131928] ${!v?"bg-[#0d1117]":"hover:bg-[#111827]"}`}>
              <td className={`px-3 py-1 ${!v?"text-teal-600 font-bold":v==="—"?"text-gray-600":"text-teal-300"}`}>{f}</td>
              <td className="px-2 py-1 text-gray-200">{v}</td>
              <td className="px-2 py-1 text-gray-600">{t}</td>
              <td className="px-2 py-1 text-gray-500">{d}</td>
            </tr>
          ))}</tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

// ─── Recording Blocks ─────────────────────────────────────────────────────────

function LocalHardwarePanel({ path = "", onPath, disabled = false, tunersOnly = false }: {
  path?: string; onPath?: (path: string) => void; disabled?: boolean; tunersOnly?: boolean;
}) {
  const [hardware, setHardware] = useState<{ drives: { DeviceID: string; VolumeName: string; FreeSpace: number }[]; tuners: { Name: string; DeviceID: string; Status: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scan = async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/dispositivos/local-hardware");
      const data = await response.json();
      if (!response.ok || data.erro) throw new Error(data.erro);
      setHardware(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Falha ao localizar dispositivos"); }
    finally { setLoading(false); }
  };
  return <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 space-y-2">
    <div className="flex justify-between gap-2"><span className="text-xs text-gray-300">{tunersOnly ? "Placas de TV digital aberta" : "HD e pasta das gravações"}</span>
      <button disabled={loading || disabled} onClick={scan} className="text-xs text-teal-400 disabled:opacity-40">{loading ? "Buscando…" : tunersOnly ? "Localizar placas" : "Localizar HDs"}</button></div>
    {!tunersOnly && <>
      {hardware && <select aria-label="HD das gravações" disabled={disabled} value="" onChange={e => onPath?.(`${e.target.value}\\DC-Censura\\Gravacoes`)} className="bg-[#1a1f2e] text-xs w-full rounded p-2">
        <option value="">Selecione o HD</option>{hardware.drives.map(d => <option key={d.DeviceID} value={d.DeviceID}>{d.DeviceID} {d.VolumeName} · {(d.FreeSpace / 1073741824).toFixed(1)} GB livres</option>)}
      </select>}
      <Input aria-label="Pasta das gravações" disabled={disabled} placeholder="D:\\DC-Censura\\Gravacoes" value={path} onChange={e => onPath?.(e.target.value)} className="bg-[#1a1f2e] text-xs"/>
      <p className="text-[10px] text-gray-500">Gravação no computador da API, em blocos MPEG-TS de 10 minutos, preservando vídeo, áudio e legenda do sinal.</p>
    </>}
    {tunersOnly && hardware && <>{hardware.tuners.length ? hardware.tuners.map(t => <div key={t.DeviceID} className="text-xs text-gray-300">{t.Name} · {t.Status}</div>) : <p className="text-xs text-gray-500">Nenhuma placa de TV digital foi identificada nos drivers Windows.</p>}<p className="text-[10px] text-gray-500">A sintonia ISDB-T depende do driver BDA/SDK da placa. A detecção não inicia a recepção RF.</p></>}
    {error && <p className="text-xs text-red-400">{error}</p>}
  </div>;
}

function RecordingBlocks({ blocks, currentSec, recording, codec }: { blocks:RecordingBlock[]; currentSec:number; recording:boolean; codec:string }) {
  const progress=(currentSec/BLOCK_SEC)*100;
  return (
    <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3" data-testid="panel-blocks">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2"><Scissors className="h-3.5 w-3.5 text-gray-400"/><span className="text-xs font-semibold text-gray-300">Gravação Contínua — Blocos de 10 min</span>{recording&&<Badge variant="destructive" className="text-[10px] py-0 px-1.5 animate-pulse">● REC</Badge>}</div>
        <span className="text-[11px] font-mono text-gray-500">{codec} · {blocks.length+(recording?1:0)} bloco(s)</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {blocks.map(b=>(
          <div key={b.index} className="flex items-center gap-1 bg-[#111827] border border-[#1e2332] rounded px-2 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-teal-500"/><span className="text-[10px] font-mono text-gray-300">#{pad(b.index)} {b.start}</span><span className="text-[10px] text-gray-500">{b.sizeMB.toFixed(0)} MB</span>
          </div>
        ))}
        {blocks.length===0&&!recording&&<span className="text-[11px] text-gray-600 italic">Nenhum bloco gravado ainda.</span>}
      </div>
      {recording&&(
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between"><span className="text-[10px] font-mono text-orange-400">Bloco #{pad(blocks.length+1)} — em gravação</span><span className="text-[10px] font-mono text-gray-400">{fmtDur(currentSec)} / 10:00 · {fmtDur(BLOCK_SEC-currentSec)} restam</span></div>
          <div className="w-full bg-[#1a1f2e] rounded-full h-2 overflow-hidden"><div className="h-full bg-gradient-to-r from-teal-600 to-teal-400 rounded-full" style={{ width:`${progress}%` }}/></div>
          <div className="flex justify-between text-[9px] text-gray-600 font-mono"><span>0:00</span><span className="text-orange-400">↓ corte automático</span><span>10:00</span></div>
        </div>
      )}
    </div>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────

const ALERT_META: Record<AlertTipo,{label:string;icon:string;color:string}> = {
  video:          { label:"Falha de Vídeo",          icon:"📺", color:"border-red-700 bg-red-950/80" },
  audio:          { label:"Falha de Áudio",          icon:"🔇", color:"border-orange-700 bg-orange-950/80" },
  closed_caption: { label:"Falha de Closed Caption", icon:"💬", color:"border-yellow-700 bg-yellow-950/60" },
  loudness:       { label:"Loudness fora do padrão", icon:"📈", color:"border-amber-700 bg-amber-950/80" },
  sinal:          { label:"Falha de Sinal",          icon:"📡", color:"border-red-700 bg-red-950/80" },
};

function AlertBanner({ alerts, onDismiss, onSend, config }: { alerts:AlertEntry[]; onDismiss:(id:string)=>void; onSend:(id:string)=>void; config:Config }) {
  const hasCh=!!(config.telegramToken||config.whatsappWebhookUrl);
  if (alerts.length===0) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="alert-banners">
      {alerts.map(a=>{
        const meta=ALERT_META[a.tipo];
        return (
          <div key={a.id} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${meta.color}`} data-testid={`alert-${a.tipo}`}>
            <span className="text-lg shrink-0">{meta.icon}</span>
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 animate-pulse"/>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-white">{meta.label}</span>
                <span className="text-[10px] text-gray-400 font-mono">{a.hora}</span>
                {a.status==="enviando"&&<span className="text-[10px] text-blue-400 animate-pulse">enviando...</span>}
                {a.status==="enviado"&&<span className="text-[10px] text-teal-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/>{a.canais.join(", ")}</span>}
                {a.status==="erro"&&<span className="text-[10px] text-red-400">{a.erros[0]}</span>}
              </div>
              <p className="text-xs text-gray-300 truncate">{a.mensagem}</p>
            </div>
            {a.status==="pendente"&&hasCh&&<button onClick={()=>onSend(a.id)} className="shrink-0 flex items-center gap-1 bg-red-700 hover:bg-red-600 text-white text-xs px-2 py-1 rounded transition-colors" data-testid={`btn-send-${a.tipo}`}><Send className="h-3 w-3"/>Notificar</button>}
            {a.status==="pendente"&&!hasCh&&<span className="text-[10px] text-gray-500 italic shrink-0">Configure notificações</span>}
            <button onClick={()=>onDismiss(a.id)} className="shrink-0 text-gray-500 hover:text-white"><X className="h-4 w-4"/></button>
          </div>
        );
      })}
    </div>
  );
}

function AlertHistory({ alerts }: { alerts:AlertEntry[] }) {
  const [open, setOpen] = useState(false);
  if (alerts.length===0) return null;
  return (
    <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg overflow-hidden">
      <button className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-400 hover:bg-[#111827] transition-colors" onClick={()=>setOpen(v=>!v)}>
        <div className="flex items-center gap-2"><Bell className="h-3.5 w-3.5"/><span className="font-semibold">Histórico de Alertas</span><Badge className="bg-[#1e2332] text-gray-300 text-[10px]">{alerts.length}</Badge></div>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open?"rotate-180":""}`}/>
      </button>
      {open&&(
        <ScrollArea className="max-h-36 border-t border-[#1e2332]">
          <table className="w-full text-[11px]">
            <thead><tr className="border-b border-[#1e2332]">{["Hora","Tipo","Mensagem","Status","Canais"].map(h=><th key={h} className="text-left text-gray-600 font-medium px-3 py-1">{h}</th>)}</tr></thead>
            <tbody>{[...alerts].reverse().map(a=>(
              <tr key={a.id} className="border-b border-[#131928] hover:bg-[#111827]">
                <td className="px-3 py-1 font-mono text-gray-500">{a.hora}</td>
                <td className="px-2 py-1"><span className={`font-semibold ${a.tipo==="video"||a.tipo==="sinal"?"text-red-400":a.tipo==="audio"?"text-orange-400":"text-yellow-400"}`}>{ALERT_META[a.tipo].label}</span></td>
                <td className="px-2 py-1 text-gray-400 max-w-xs truncate">{a.mensagem}</td>
                <td className="px-2 py-1">{a.status==="enviado"&&<span className="text-teal-400">Enviado</span>}{a.status==="erro"&&<span className="text-red-400">Erro</span>}{a.status==="pendente"&&<span className="text-gray-500">Pendente</span>}{a.status==="enviando"&&<span className="text-blue-400">Enviando</span>}</td>
                <td className="px-2 py-1 text-gray-500">{a.canais.length?a.canais.join(", "):"—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}

// ─── BMD Device Card ──────────────────────────────────────────────────────────

function BmdDeviceCard({ dev, selected, onSelect }: { dev: BmdDevice; selected: boolean; onSelect: (d: BmdDevice) => void }) {
  return (
    <button onClick={() => onSelect(dev)} data-testid={`bmd-device-${dev.id}`}
      className={`w-full text-left rounded-lg border p-3 transition-colors ${selected ? "border-teal-600 bg-teal-950/30" : "border-[#1e2332] bg-[#0d1117] hover:bg-[#111827]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-teal-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-gray-200">{dev.deviceName}</p>
            <p className="text-[10px] text-gray-500">{dev.vendorName} · ID {dev.persistentId}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-[10px] shrink-0 ${dev.signalPresent ? "text-teal-400" : "text-gray-600"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${dev.signalPresent ? "bg-teal-400 animate-pulse" : "bg-gray-600"}`} />
          {dev.signalPresent ? "Sinal" : "Sem sinal"}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {dev.connectors.map(c => <span key={c} className="text-[10px] bg-[#1a1f2e] text-gray-300 px-1.5 py-0.5 rounded">{c}</span>)}
        <span className="text-[10px] bg-[#1a1f2e] text-gray-400 px-1.5 py-0.5 rounded">{dev.numPorts} porta(s)</span>
        <span className="text-[10px] bg-[#1a1f2e] text-gray-400 px-1.5 py-0.5 rounded">FW {dev.firmwareVersion}</span>
      </div>
    </button>
  );
}

// ─── Source Form ──────────────────────────────────────────────────────────────

function SourceForm({ source, bmdDevices, bmdLoading, onRefreshBmd, onChange }: {
  source: SignalSource; bmdDevices: BmdDevice[]; bmdLoading: boolean;
  onRefreshBmd: () => void; onChange: (s: SignalSource) => void;
}) {
  const upd = (patch: Partial<SignalSource>) => onChange({ ...source, ...patch });
  const updSdi = (patch: Partial<SdiConfig>) => upd({ sdi: { ...source.sdi!, ...patch } });
  const updSrt = (patch: Partial<SrtConfig>) => upd({ srt: { ...source.srt!, ...patch } });
  const updUdp = (patch: Partial<UdpConfig>) => upd({ udp: { ...source.udp!, ...patch } });
  const selDev = bmdDevices.find(d => d.id === source.sdi?.deviceId);

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Nome e tipo */}
      <div className="grid grid-cols-2 gap-3">
        <FRow label="Nome da Entrada">
          <Input value={source.nome} onChange={e => upd({ nome: e.target.value })} className={iCls} placeholder="Ex: SDI 1 — Principal" data-testid="sf-nome" />
        </FRow>
        <FRow label="Tipo de Entrada">
          <Select value={source.tipo} onValueChange={v => {
            const tipo = v as "sdi"|"srt"|"udp";
            const base = { ...source, tipo };
            if (tipo==="sdi"&&!base.sdi) base.sdi={ deviceId:"", deviceName:"", portIndex:1, videoFormat:"HD 1080i 59.94", audioChannels:8, linkMode:"single" };
            if (tipo==="srt"&&!base.srt) base.srt={ host:"", port:9000, latencyMs:120, passphrase:"", mode:"caller", streamId:"" };
            if (tipo==="udp"&&!base.udp) base.udp={ address:"239.1.1.1", port:1234, interface:"0.0.0.0", bufferSize:1500000, protocol:"udp" };
            onChange(base);
          }}>
            <ST data-testid="sf-tipo"><SelectValue /></ST>
            <SC>{[["sdi","SDI / Blackmagic"],["srt","SRT"],["udp","UDP / Multicast"]].map(([v,l])=><SI key={v} value={v}>{l}</SI>)}</SC>
          </Select>
        </FRow>
      </div>

      {/* SDI */}
      {source.tipo === "sdi" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-teal-400 uppercase tracking-widest">Placas de Captura Blackmagic (DeckLink SDK)</p>
            <button onClick={onRefreshBmd} disabled={bmdLoading}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-teal-400 transition-colors" data-testid="btn-refresh-bmd">
              {bmdLoading ? <Loader2 className="h-3 w-3 animate-spin"/> : <RefreshCw className="h-3 w-3"/>}
              {bmdLoading ? "Detectando..." : "Atualizar Lista"}
            </button>
          </div>
          {bmdLoading && <div className="text-center py-4 text-xs text-gray-500">Escaneando bus PCIe/USB Thunderbolt...</div>}
          {!bmdLoading && bmdDevices.length === 0 && (
            <div className="text-center py-4 text-xs text-gray-500">Nenhuma placa DeckLink detectada. Verifique o driver Blackmagic Desktop Video.</div>
          )}
          <div className="grid gap-2">
            {bmdDevices.map(d => <BmdDeviceCard key={d.id} dev={d} selected={source.sdi?.deviceId===d.id} onSelect={d=>updSdi({ deviceId:d.id, deviceName:d.deviceName })}/>)}
          </div>
          {selDev && (
            <div className="grid grid-cols-2 gap-3">
              <FRow label="Porta SDI">
                <Select value={String(source.sdi?.portIndex??1)} onValueChange={v=>updSdi({ portIndex:parseInt(v) })}>
                  <ST data-testid="sf-sdi-port"><SelectValue /></ST>
                  <SC>{Array.from({length:selDev.numPorts},(_,i)=><SI key={i+1} value={String(i+1)}>Porta {i+1}</SI>)}</SC>
                </Select>
              </FRow>
              <FRow label="Formato de Vídeo">
                <Select value={source.sdi?.videoFormat??""} onValueChange={v=>updSdi({ videoFormat:v })}>
                  <ST data-testid="sf-sdi-format"><SelectValue /></ST>
                  <SC>{selDev.supportedVideoModes.map(m=><SI key={m.name} value={m.name}>{m.name} · {m.pixelFormat}</SI>)}</SC>
                </Select>
              </FRow>
              <FRow label="Canais de Áudio">
                <Select value={String(source.sdi?.audioChannels??8)} onValueChange={v=>updSdi({ audioChannels:parseInt(v) })}>
                  <ST data-testid="sf-sdi-audio"><SelectValue /></ST>
                  <SC>{selDev.audioChannels.map(ch=><SI key={ch} value={String(ch)}>{ch} canais</SI>)}</SC>
                </Select>
              </FRow>
              <FRow label="Link Mode">
                <Select value={source.sdi?.linkMode??"single"} onValueChange={v=>updSdi({ linkMode:v })}>
                  <ST data-testid="sf-sdi-link"><SelectValue /></ST>
                  <SC>{selDev.linkMode.map(l=><SI key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)} Link</SI>)}</SC>
                </Select>
              </FRow>
            </div>
          )}
        </div>
      )}

      {/* SRT */}
      {source.tipo === "srt" && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold text-teal-400 uppercase tracking-widest">Configuração SRT (Secure Reliable Transport)</p>
          <div className="grid grid-cols-2 gap-3">
            <FRow label="Host / IP">
              <Input value={source.srt?.host??""} onChange={e=>updSrt({ host:e.target.value })} className={iCls} placeholder="192.168.1.100" data-testid="sf-srt-host"/>
            </FRow>
            <FRow label="Porta">
              <Input type="number" value={source.srt?.port??9000} onChange={e=>updSrt({ port:parseInt(e.target.value)||9000 })} className={iCls} placeholder="9000" data-testid="sf-srt-port"/>
            </FRow>
            <FRow label="Modo">
              <Select value={source.srt?.mode??"caller"} onValueChange={v=>updSrt({ mode:v as "caller"|"listener" })}>
                <ST data-testid="sf-srt-mode"><SelectValue /></ST>
                <SC><SI value="caller">Caller (conecta ao servidor)</SI><SI value="listener">Listener (aguarda conexão)</SI></SC>
              </Select>
            </FRow>
            <FRow label="Latência (ms)">
              <Input type="number" value={source.srt?.latencyMs??120} onChange={e=>updSrt({ latencyMs:parseInt(e.target.value)||120 })} className={iCls} placeholder="120" data-testid="sf-srt-latency"/>
            </FRow>
            <FRow label="Passphrase (AES)">
              <Input type="password" value={source.srt?.passphrase??""} onChange={e=>updSrt({ passphrase:e.target.value })} className={iCls} placeholder="Deixe vazio se não criptografado" data-testid="sf-srt-pass"/>
            </FRow>
            <FRow label="Stream ID">
              <Input value={source.srt?.streamId??""} onChange={e=>updSrt({ streamId:e.target.value })} className={iCls} placeholder="dccp/main (opcional)" data-testid="sf-srt-streamid"/>
            </FRow>
          </div>
        </div>
      )}

      {/* UDP */}
      {source.tipo === "udp" && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-semibold text-teal-400 uppercase tracking-widest">Configuração UDP / Multicast</p>
          <div className="grid grid-cols-2 gap-3">
            <FRow label="Endereço (multicast/unicast)">
              <Input value={source.udp?.address??""} onChange={e=>updUdp({ address:e.target.value })} className={iCls} placeholder="239.1.1.1" data-testid="sf-udp-addr"/>
            </FRow>
            <FRow label="Porta">
              <Input type="number" value={source.udp?.port??1234} onChange={e=>updUdp({ port:parseInt(e.target.value)||1234 })} className={iCls} placeholder="1234" data-testid="sf-udp-port"/>
            </FRow>
            <FRow label="Interface de Rede">
              <Input value={source.udp?.interface??""} onChange={e=>updUdp({ interface:e.target.value })} className={iCls} placeholder="0.0.0.0 (todas)" data-testid="sf-udp-iface"/>
            </FRow>
            <FRow label="Protocolo">
              <Select value={source.udp?.protocol??"udp"} onValueChange={v=>updUdp({ protocol:v as "udp"|"rtp" })}>
                <ST data-testid="sf-udp-proto"><SelectValue /></ST>
                <SC><SI value="udp">UDP puro</SI><SI value="rtp">RTP (MPEG-TS sobre RTP)</SI></SC>
              </Select>
            </FRow>
            <FRow label="Buffer (bytes)">
              <Input type="number" value={source.udp?.bufferSize??1500000} onChange={e=>updUdp({ bufferSize:parseInt(e.target.value)||1500000 })} className={iCls} placeholder="1500000" data-testid="sf-udp-buf"/>
            </FRow>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entradas Dialog ──────────────────────────────────────────────────────────

function EntradasDialog({ open, onOpenChange, sources, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  sources: SignalSource[]; onSave: (s: SignalSource[]) => void;
}) {
  const [list, setList] = useState<SignalSource[]>(sources);
  const [editing, setEditing] = useState<SignalSource | null>(null);
  const [bmdDevices, setBmdDevices] = useState<BmdDevice[]>([]);
  const [bmdLoading, setBmdLoading] = useState(false);

  // Reset when dialog opens
  useEffect(() => { if (open) { setList(sources); setEditing(null); } }, [open, sources]);

  const fetchBmd = useCallback(async () => {
    setBmdLoading(true);
    try {
      const res = await fetch("/api/dispositivos/blackmagic");
      const data = await res.json() as { dispositivos: BmdDevice[] };
      setBmdDevices(data.dispositivos);
    } catch { setBmdDevices([]); } finally { setBmdLoading(false); }
  }, []);

  useEffect(() => { if (open) fetchBmd(); }, [open, fetchBmd]);

  const startNew = () => {
    const nova: SignalSource = { id: uid(), nome: "Nova Entrada", tipo: "sdi", ativo: true, sdi: { deviceId:"", deviceName:"", portIndex:1, videoFormat:"HD 1080i 59.94", audioChannels:8, linkMode:"single" } };
    setEditing(nova);
  };

  const saveEditing = () => {
    if (!editing) return;
    const exists = list.find(s => s.id === editing.id);
    setList(exists ? list.map(s => s.id === editing.id ? editing : s) : [...list, editing]);
    setEditing(null);
  };

  const deleteSource = (id: string) => setList(l => l.filter(s => s.id !== id));

  const handleSave = () => { onSave(list); onOpenChange(false); };

  const srcIcon = (tipo: SignalSource["tipo"]) => tipo==="sdi"?<Cpu className="h-3.5 w-3.5 text-teal-400"/>:tipo==="srt"?<Wifi className="h-3.5 w-3.5 text-blue-400"/>:<Globe className="h-3.5 w-3.5 text-purple-400"/>;
  const srcBadge = (s: SignalSource) => {
    if (s.tipo==="sdi") return `${s.sdi?.deviceName?.split(" ").slice(0,2).join(" ")??"SDI"} · Porta ${s.sdi?.portIndex??1}`;
    if (s.tipo==="srt") return `${s.srt?.host??""}\:${s.srt?.port??9000} · ${s.srt?.mode??"caller"}`;
    return `${s.udp?.address??""}\:${s.udp?.port??1234} · ${s.udp?.protocol?.toUpperCase()??"UDP"}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f1117] border-[#1e2332] text-white max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-teal-400"/>Gerenciar Entradas de Sinal
          </DialogTitle>
        </DialogHeader>

        <LocalHardwarePanel tunersOnly/>
        {editing ? (
          /* ─── Edit form ─── */
          <div>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setEditing(null)} className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1">
                <ChevronDown className="h-3 w-3 rotate-90"/>Voltar
              </button>
              <span className="text-xs text-gray-600">/</span>
              <span className="text-xs text-gray-300">{editing.nome}</span>
            </div>
            <SourceForm source={editing} bmdDevices={bmdDevices} bmdLoading={bmdLoading} onRefreshBmd={fetchBmd} onChange={setEditing}/>
            <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[#1e2332]">
              <button onClick={() => setEditing(null)} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white">Cancelar</button>
              <button onClick={saveEditing} className="px-4 py-1.5 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded-md transition-colors" data-testid="btn-save-entrada">Salvar Entrada</button>
            </div>
          </div>
        ) : (
          /* ─── List view ─── */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{list.length} entrada(s) configurada(s)</span>
              <button onClick={startNew} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 text-white text-xs px-3 py-1.5 rounded-md transition-colors" data-testid="btn-nova-entrada">
                <Plus className="h-3.5 w-3.5"/>Nova Entrada
              </button>
            </div>

            {list.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-500">Nenhuma entrada configurada. Clique em "Nova Entrada" para adicionar.</div>
            )}

            <div className="flex flex-col gap-2">
              {list.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 bg-[#111827] border border-[#1e2332] rounded-lg px-4 py-3" data-testid={`entrada-${s.id}`}>
                  <div className="flex items-center gap-2 w-5 text-gray-600">
                    {srcIcon(s.tipo)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-200 truncate">{s.nome}</span>
                      <Badge className={`text-[10px] py-0 px-1.5 shrink-0 ${s.tipo==="sdi"?"bg-teal-900 text-teal-300":s.tipo==="srt"?"bg-blue-900 text-blue-300":"bg-purple-900 text-purple-300"}`}>{s.tipo.toUpperCase()}</Badge>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate font-mono">{srcBadge(s)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch checked={s.ativo} onCheckedChange={v=>setList(l=>l.map(x=>x.id===s.id?{...x,ativo:v}:x))} className="scale-75" data-testid={`switch-ativo-${s.id}`}/>
                    <button onClick={() => setEditing({ ...s })} className="p-1.5 text-gray-500 hover:text-teal-400 transition-colors" data-testid={`btn-edit-${s.id}`}><Pencil className="h-3.5 w-3.5"/></button>
                    <button onClick={() => deleteSource(s.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" data-testid={`btn-del-${s.id}`}><Trash2 className="h-3.5 w-3.5"/></button>
                    <div className="flex gap-0.5 ml-1">
                      <button disabled={i===0} onClick={()=>{ const l=[...list]; [l[i-1],l[i]]=[l[i],l[i-1]]; setList(l); }} className="p-1 text-gray-600 hover:text-gray-400 disabled:opacity-20 transition-colors">↑</button>
                      <button disabled={i===list.length-1} onClick={()=>{ const l=[...list]; [l[i+1],l[i]]=[l[i],l[i+1]]; setList(l); }} className="p-1 text-gray-600 hover:text-gray-400 disabled:opacity-20 transition-colors">↓</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#1e2332]">
              <button onClick={() => onOpenChange(false)} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-1.5 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded-md transition-colors" data-testid="btn-save-entradas">Salvar Entradas</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Settings Dialog (codec/audio/CC/notifications) ───────────────────────────

function SettingsDialog({ open, onOpenChange, config, onChange, sourceName }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  config: Config; onChange: (c: Config) => void; sourceName: string;
}) {
  const [draft, setDraft] = useState<Config>(config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const u = (k: keyof Config, v: string|number|boolean) => setDraft(d=>({...d,[k]:v}));
  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    const { canais, erros } = await enviarNotificacao("sinal","Teste de Conectividade",`Notificação de teste — ${SISTEMA_FULL}`,sourceName,draft);
    setTesting(false); setTestResult(canais.length?`Enviado: ${canais.join(", ")}`:`Erro: ${erros.join("; ")}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f1117] border-[#1e2332] text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-white flex items-center gap-2"><Settings className="h-4 w-4 text-teal-400"/>Configurações — {SISTEMA}</DialogTitle></DialogHeader>
        <div className="grid gap-5 py-2">
          <Sec title="Codec e Bitrate de Saída">
            <Row label="Codec"><Select value={draft.codec} onValueChange={v=>u("codec",v)}><ST><SelectValue/></ST><SC>{["ProRes 422 HQ","ProRes 4444","DNxHD 185","H.264 High","H.265 Main","MPEG-2 422P@HL"].map(c=><SI key={c} value={c}>{c}</SI>)}</SC></Select></Row>
            <Row label="Bitrate"><Select value={draft.bitrate} onValueChange={v=>u("bitrate",v)}><ST><SelectValue/></ST><SC>{["8 Mbps","15 Mbps","25 Mbps","35 Mbps","50 Mbps","100 Mbps","220 Mbps"].map(b=><SI key={b} value={b}>{b}</SI>)}</SC></Select></Row>
            <Row label="Container"><Select value={draft.container} onValueChange={v=>u("container",v)}><ST><SelectValue/></ST><SC>{["MOV","MXF (OP1a)","MP4","TS (MPEG-2 Transport Stream)"].map(c=><SI key={c} value={c}>{c}</SI>)}</SC></Select></Row>
          </Sec>
          <Sec title="Áudio Embedded">
            <Row label="Formato"><Select value={draft.audioFormat} onValueChange={v=>u("audioFormat",v)}><ST><SelectValue/></ST><SC>{["PCM 48kHz/24-bit","PCM 48kHz/16-bit","AAC-LC 48kHz","AAC-HE 48kHz","AC-3 5.1"].map(a=><SI key={a} value={a}>{a}</SI>)}</SC></Select></Row>
            <Row label="Canais"><Select value={draft.audioChannels} onValueChange={v=>u("audioChannels",v)}><ST><SelectValue/></ST><SC>{["2 (Estéreo)","4 (2 pares)","6 (5.1)","8 (4 pares AES/EBU)","16 (8 pares SDI)"].map(c=><SI key={c} value={c}>{c}</SI>)}</SC></Select></Row>
          </Sec>
          <Sec title="Closed Caption">
            <Row label="Idioma"><Select value={draft.ccLang} onValueChange={v=>u("ccLang",v)}><ST><SelectValue/></ST><SC>{["Português (por)","Inglês (eng)","Espanhol (spa)","Libras (sgn-BR)"].map(l=><SI key={l} value={l}>{l}</SI>)}</SC></Select></Row>
            <Row label="Formato"><Select value={draft.ccFormat} onValueChange={v=>u("ccFormat",v)}><ST><SelectValue/></ST><SC>{["CEA-708 (DTVCC)","CEA-608 (Line 21)","ABNT NBR 15606-3","SRT","WebVTT","TTML"].map(f=><SI key={f} value={f}>{f}</SI>)}</SC></Select></Row>
          </Sec>
          <Sec title="Gravação Contínua">
            <Row label="Duração do Bloco"><div className="flex items-center gap-2"><Input value="10" disabled className="bg-[#111] border-[#2a3050] text-gray-500 h-8 text-xs w-16"/><span className="text-xs text-gray-500">minutos (padrão broadcast)</span></div></Row>
            <LocalHardwarePanel path={draft.outputPath} onPath={path=>u("outputPath",path)}/>
          </Sec>
          <Sec title="Notificações de Falha">
            <div className="flex flex-col gap-2 mb-2">
              {[["notifyVideoLoss","Falha de Vídeo"],["notifyAudioLoss","Falha de Áudio"],["notifyCCLoss","Falha de CC"],["notifyLoudnessLoss","Loudness fora do padrão"]].map(([k,l])=>(
                <div key={k} className="flex items-center justify-between"><Label className="text-xs text-gray-400">{l}</Label><Switch checked={!!draft[k as keyof Config]} onCheckedChange={v=>u(k as keyof Config,v)} className="scale-75"/></div>
              ))}
            </div>
            <div className="border-t border-[#1e2332] pt-3">
              <p className="text-[11px] text-teal-400 font-semibold uppercase tracking-widest mb-2">Telegram</p>
              <Row label="Bot Token"><Input value={draft.telegramToken} onChange={e=>u("telegramToken",e.target.value)} className={iCls} placeholder="1234567890:AAF..." data-testid="settings-tg-token"/></Row>
              <Row label="Chat ID"><Input value={draft.telegramChatId} onChange={e=>u("telegramChatId",e.target.value)} className={iCls} placeholder="-100123456789" data-testid="settings-tg-chat"/></Row>
            </div>
            <div className="border-t border-[#1e2332] pt-3 mt-2">
              <p className="text-[11px] text-teal-400 font-semibold uppercase tracking-widest mb-2">WhatsApp</p>
              <Row label="Provedor"><Select value={draft.whatsappProvider} onValueChange={v=>u("whatsappProvider",v)}><ST><SelectValue/></ST><SC>{[["webhook","Webhook Genérico"],["z-api","Z-API"],["ultraMsg","UltraMsg"],["callmebot","CallMeBot (Grátis)"]].map(([v,l])=><SI key={v} value={v}>{l}</SI>)}</SC></Select></Row>
              <Row label="Número (+55...)"><Input value={draft.whatsappNumero} onChange={e=>u("whatsappNumero",e.target.value)} className={iCls} placeholder="+5511999999999" data-testid="settings-wa-num"/></Row>
              <Row label="Webhook URL"><Input value={draft.whatsappWebhookUrl} onChange={e=>u("whatsappWebhookUrl",e.target.value)} className={iCls} placeholder="https://api.z-api.io/..." data-testid="settings-wa-url"/></Row>
              <Row label="Token / API Key"><Input value={draft.whatsappToken} onChange={e=>u("whatsappToken",e.target.value)} className={iCls} placeholder="Token do provedor" data-testid="settings-wa-token"/></Row>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 bg-teal-800 hover:bg-teal-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded transition-colors" data-testid="btn-test-notif">
                <Send className="h-3 w-3"/>{testing?"Enviando...":"Testar Notificação"}
              </button>
              {testResult&&<span className={`text-xs ${testResult.startsWith("Enviado")?"text-teal-400":"text-red-400"}`}>{testResult}</span>}
            </div>
          </Sec>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-[#1e2332]">
          <button className="px-4 py-1.5 text-xs text-gray-400 hover:text-white" onClick={()=>onOpenChange(false)}>Cancelar</button>
          <button className="px-4 py-1.5 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded-md transition-colors" onClick={()=>{ onChange(draft); onOpenChange(false); }} data-testid="btn-settings-save">Salvar</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────

const iCls = "bg-[#1a1f2e] border-[#2a3050] text-gray-200 h-8 text-xs";
const ST = (p: React.ComponentProps<typeof SelectTrigger>) => <SelectTrigger className={`${iCls} w-full`} {...p}/>;
const SC = ({ children }: { children: React.ReactNode }) => <SelectContent className="bg-[#1a1f2e] border-[#2a3050] text-gray-200">{children}</SelectContent>;
const SI = (p: React.ComponentProps<typeof SelectItem>) => <SelectItem className="text-xs" {...p}/>;
const Sec = ({ title, children }: { title: string; children: React.ReactNode }) => <div><div className="text-[11px] font-semibold text-teal-400 uppercase tracking-widest mb-2 border-b border-[#1e2332] pb-1">{title}</div><div className="grid gap-2">{children}</div></div>;
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="grid grid-cols-[160px_1fr] items-center gap-3"><Label className="text-xs text-gray-400">{label}</Label>{children}</div>;
const FRow = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="flex flex-col gap-1"><Label className="text-xs text-gray-400">{label}</Label>{children}</div>;

// ─── Status / Metric tiles ────────────────────────────────────────────────────

function StatusRow({ label, value, active, onClick, testId }: { label:string; value:string; active:boolean; onClick:()=>void; testId:string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <button onClick={onClick} className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${active?"bg-teal-800 text-teal-200 hover:bg-teal-700":"bg-[#1e2332] text-gray-400 hover:bg-[#252b40]"}`} data-testid={testId}>{value}</button>
    </div>
  );
}
function MetricTile({ label, value, unit, warn=false, danger=false }: { label:string; value:string; unit:string; warn?:boolean; danger?:boolean }) {
  const color = danger?"text-red-400":warn?"text-orange-400":"text-teal-300";
  return (
    <div className="bg-[#111827] rounded-md p-2 flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className={`text-base font-mono font-bold tabular-nums leading-tight ${color}`}>{value}</span>
      <span className="text-[10px] text-gray-600 leading-tight">{unit}</span>
    </div>
  );
}

// ─── SRT Test Dialog ──────────────────────────────────────────────────────────

interface SrtProbeStream {
  index: number; id?: number; codec: string; codecNome?: string; tipo: "video"|"audio"|"data"|"outro";
  resolucao?: string; fps?: number; bitrate?: number; canais?: number;
  amostragem?: number; perfil?: string; nivel?: string; pixelFormat?: string; idioma?: string; titulo?: string;
}
interface SrtProbeResult {
  ok: boolean; conectado: boolean; streams: SrtProbeStream[];
  formato: { container: string; duracao: number; bitrateTotalKbps: number; programas: number; titulo?: string; provedor?: string } | null;
  canal: { programaId?: number; programaNumero?: number; pmtPid?: number; pcrPid?: number; nome?: string; provedor?: string; streams?: number[]; temVideo?: boolean; temAudio?: boolean } | null;
  canais: { programaId?: number; programaNumero?: number; pmtPid?: number; pcrPid?: number; nome?: string; provedor?: string; streams?: number[]; temVideo?: boolean; temAudio?: boolean }[];
  erro: string | null; duracaoProbeMs: number; url: string;
}
type AribEstado = "capturado" | "sem_cc" | "erro";

function SrtTestDialog({ open, onOpenChange, source }: {
  open: boolean; onOpenChange: (v: boolean) => void; source: SignalSource | null;
}) {
  const srt = source?.srt;
  const [host, setHost] = useState(srt?.host ?? "");
  const [port, setPort] = useState(String(srt?.port ?? 9000));
  const [mode, setMode] = useState<"caller"|"listener">(srt?.mode ?? "caller");
  const [latency, setLatency] = useState(String(srt?.latencyMs ?? 120));
  const [passphrase, setPassphrase] = useState(srt?.passphrase ?? "");
  const [streamId, setStreamId] = useState(srt?.streamId ?? "");
  const [timeout, setTimeout_] = useState("8000");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SrtProbeResult | null>(null);

  // Sync fields when source changes or dialog opens
  useEffect(() => {
    if (open && srt) {
      setHost(srt.host ?? "");
      setPort(String(srt.port ?? 9000));
      setMode(srt.mode ?? "caller");
      setLatency(String(srt.latencyMs ?? 120));
      setPassphrase(srt.passphrase ?? "");
      setStreamId(srt.streamId ?? "");
      setResult(null);
    }
  }, [open, srt]);

  const runProbe = async () => {
    if (!host || !port) return;
    setLoading(true); setResult(null);
    try {
      const res = await fetch("/api/srt/probe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: parseInt(port), mode, latencyMs: parseInt(latency), passphrase: passphrase||undefined, streamId: streamId||undefined, timeoutMs: parseInt(timeout) }),
      });
      const data = await res.json() as SrtProbeResult;
      setResult(data);
    } catch (e) {
      setResult({ ok: false, conectado: false, streams: [], formato: null, canal: null, canais: [], erro: String(e), duracaoProbeMs: 0, url: "" });
    } finally { setLoading(false); }
  };

  const srtUrl = host && port ? `srt://${host}:${port}?mode=${mode}&latency=${parseInt(latency)*1000}${passphrase?`&passphrase=***`:""}${streamId?`&streamid=${streamId}`:""}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0f1117] border-[#1e2332] text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-400"/>Teste de Sinal SRT
            {source && <span className="text-xs text-gray-500 font-normal">— {source.nome}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* URL preview */}
        {srtUrl && (
          <div className="bg-[#0a0e17] border border-[#1e2332] rounded px-3 py-2 font-mono text-[11px] text-blue-300 break-all">
            {srtUrl}
          </div>
        )}

        {/* Params grid */}
        <div className="grid grid-cols-2 gap-3">
          <FRow label="Host / IP">
            <Input value={host} onChange={e=>setHost(e.target.value)} className={iCls} placeholder="192.168.1.100 ou broadcast.exemplo.com" data-testid="srt-host"/>
          </FRow>
          <FRow label="Porta">
            <Input type="number" value={port} onChange={e=>setPort(e.target.value)} className={iCls} placeholder="9000" data-testid="srt-port"/>
          </FRow>
          <FRow label="Modo">
            <Select value={mode} onValueChange={v=>setMode(v as "caller"|"listener")}>
              <ST data-testid="srt-mode"><SelectValue /></ST>
              <SC><SI value="caller">Caller (conecta ao servidor)</SI><SI value="listener">Listener (aguarda)</SI></SC>
            </Select>
          </FRow>
          <FRow label="Latência (ms)">
            <Input type="number" value={latency} onChange={e=>setLatency(e.target.value)} className={iCls} placeholder="120" data-testid="srt-latency"/>
          </FRow>
          <FRow label="Passphrase AES">
            <Input type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} className={iCls} placeholder="Deixe vazio se sem criptografia" data-testid="srt-pass"/>
          </FRow>
          <FRow label="Stream ID">
            <Input value={streamId} onChange={e=>setStreamId(e.target.value)} className={iCls} placeholder="dccp/main (opcional)" data-testid="srt-streamid"/>
          </FRow>
          <FRow label="Timeout do Probe">
            <Select value={timeout} onValueChange={setTimeout_}>
              <ST><SelectValue /></ST>
              <SC>{[["3000","3 s"],["5000","5 s"],["8000","8 s"],["12000","12 s"]].map(([v,l])=><SI key={v} value={v}>{l}</SI>)}</SC>
            </Select>
          </FRow>
        </div>

        {/* Action */}
        <div className="flex items-center gap-3">
          <button onClick={runProbe} disabled={loading || !host}
            className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-md transition-colors" data-testid="btn-srt-probe">
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin"/>Conectando via ffprobe...</> : <><Signal className="h-3.5 w-3.5"/>Testar Conexão SRT</>}
          </button>
          {result && !loading && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${result.ok ? "text-teal-400" : "text-red-400"}`}>
              {result.ok ? <CheckCircle2 className="h-4 w-4"/> : <X className="h-4 w-4"/>}
              {result.ok ? `Conectado em ${result.duracaoProbeMs}ms` : "Falha na conexão"}
            </div>
          )}
        </div>

        {/* Results */}
        {result && !loading && (
          <div className="flex flex-col gap-3 border-t border-[#1e2332] pt-3">

            {/* Error */}
            {!result.ok && result.erro && (
              <div className="bg-red-950/40 border border-red-800 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-400 mb-1 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5"/>Erro de Conexão</p>
                <p className="text-[11px] font-mono text-red-300 whitespace-pre-wrap">{result.erro}</p>
              </div>
            )}

            {/* Success: streams */}
            {result.ok && (
              <>
                {result.formato && (
                  <div className="bg-[#0d1117] border border-[#1e2332] rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-widest mb-2">Formato do Transporte</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[["Container", result.formato.container],["Bitrate Total",`${result.formato.bitrateTotalKbps} Kbps`],["Programas",String(result.formato.programas)],["Duração",result.formato.duracao>0?`${result.formato.duracao.toFixed(1)}s`:"ao vivo"]].map(([l,v])=>(
                        <div key={l} className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">{l}</span><span className="text-[11px] font-mono text-gray-200">{v}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-widest">{result.streams.length} Stream(s) Detectado(s)</p>

                {result.streams.map(s => (
                  <div key={s.index} className={`rounded-lg border p-3 ${s.tipo==="video"?"border-teal-800 bg-teal-950/20":s.tipo==="audio"?"border-blue-800 bg-blue-950/20":"border-[#1e2332] bg-[#0d1117]"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`text-[10px] py-0 px-1.5 ${s.tipo==="video"?"bg-teal-900 text-teal-300":s.tipo==="audio"?"bg-blue-900 text-blue-300":"bg-gray-900 text-gray-400"}`}>
                        {s.tipo.toUpperCase()} #{s.index}
                      </Badge>
                      <span className="text-xs font-mono font-semibold text-gray-200">{s.codec.toUpperCase()}</span>
                      {s.perfil && <span className="text-[10px] text-gray-500">{s.perfil}</span>}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {s.tipo==="video" && <>
                        {s.resolucao && <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">Resolução</span><span className="text-[11px] font-mono text-gray-300">{s.resolucao}</span></div>}
                        {s.fps && <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">Frame Rate</span><span className="text-[11px] font-mono text-gray-300">{s.fps} fps</span></div>}
                        {s.bitrate && <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">Bitrate</span><span className="text-[11px] font-mono text-gray-300">{s.bitrate} Kbps</span></div>}
                        {s.pixelFormat && <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">Pixel Fmt</span><span className="text-[11px] font-mono text-gray-300">{s.pixelFormat}</span></div>}
                      </>}
                      {s.tipo==="audio" && <>
                        {s.canais && <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">Canais</span><span className="text-[11px] font-mono text-gray-300">{s.canais}</span></div>}
                        {s.amostragem && <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">Sample Rate</span><span className="text-[11px] font-mono text-gray-300">{s.amostragem} Hz</span></div>}
                        {s.bitrate && <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-500">Bitrate</span><span className="text-[11px] font-mono text-gray-300">{s.bitrate} Kbps</span></div>}
                      </>}
                    </div>
                  </div>
                ))}

                {result.streams.length === 0 && (
                  <p className="text-xs text-gray-500 italic">Conexão estabelecida mas nenhum stream detectado ainda (o encoder pode ainda não estar enviando).</p>
                )}
              </>
            )}

            {/* Probe metadata */}
            <div className="flex items-center gap-3 text-[10px] text-gray-600 font-mono border-t border-[#1e2332] pt-2">
              <span>ffprobe · {result.duracaoProbeMs}ms</span>
              {result.url && <span className="truncate">{result.url}</span>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BtsReportDialog({
  open,
  onOpenChange,
  checks,
  sourceName,
  selectedProgram,
  directoryName,
  onChooseDirectory,
  onGenerate,
  saving,
  lastSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checks: BtsAuditCheck[];
  sourceName: string;
  selectedProgram: string;
  directoryName: string | null;
  onChooseDirectory: () => void;
  onGenerate: () => void;
  saving: boolean;
  lastSaved: string | null;
}) {
  const failures = checks.filter(check => check.status === "erro");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0f1117] border-[#2a3050] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-100">
            <FileText className="h-4 w-4 text-teal-400"/>
            Relatório BTS e conformidade
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="rounded-lg border border-[#1e2332] bg-[#0b0e14] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-gray-500">Destino dos arquivos</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-mono text-gray-200 truncate">
                  <HardDrive className="h-3.5 w-3.5 shrink-0 text-blue-400"/>
                  {directoryName ?? "Nenhum HD/diretório selecionado"}
                </p>
              </div>
              <button
                onClick={onChooseDirectory}
                className="shrink-0 flex items-center gap-1.5 rounded-md border border-blue-800 bg-blue-950/40 px-2.5 py-1.5 text-[11px] text-blue-300 hover:bg-blue-900/50 transition-colors"
                data-testid="btn-select-bts-directory"
              >
                <FolderOpen className="h-3.5 w-3.5"/>
                Selecionar HD
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
              O navegador só grava em um diretório depois da sua autorização. Sem seleção, os arquivos serão baixados para a pasta padrão do navegador.
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-gray-500">Auditoria do BTS</p>
                <p className="mt-0.5 text-[11px] text-gray-400 truncate">{sourceName} · {selectedProgram}</p>
              </div>
              <span className={`text-[10px] font-mono font-semibold ${failures.length ? "text-red-400" : "text-teal-400"}`}>
                {failures.length ? `${failures.length} falha(s)` : "Sem falhas"}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {checks.map(check => (
                <div key={check.id} className="rounded-md border border-[#1e2332] bg-[#111827] px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                      {check.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 text-teal-400"/> : <AlertTriangle className={`h-3.5 w-3.5 ${auditColor(check.status)}`}/>}
                      {check.label}
                    </span>
                    <span className={`text-[9px] font-mono font-bold ${auditColor(check.status)}`}>{auditLabel(check.status)}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{check.detalhe}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-amber-900/50 bg-amber-950/15 p-3 text-[10px] leading-relaxed text-amber-200/80">
            <strong className="text-amber-300">Referência de loudness:</strong> alvo operacional de -23 LUFS, com tolerância de ±2 LU, baseado na medição de programa para TV digital. A leitura do SRT é RMS aproximada; a validação legal final deve usar medidor ITU-R BS.1770-4 dedicado.
          </div>

          {lastSaved && (
            <div className="flex items-center gap-1.5 text-[10px] text-teal-400">
              <CheckCircle2 className="h-3 w-3"/>
              {lastSaved}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-[#1e2332] pt-3">
            <button onClick={() => onOpenChange(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
              Fechar
            </button>
            <button
              onClick={onGenerate}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50 transition-colors"
              data-testid="btn-generate-bts-report"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Save className="h-3.5 w-3.5"/>}
              {saving ? "Salvando…" : "Gerar e salvar relatório"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MonitorAoVivo() {
  const [, setLocation] = useLocation();
  const { sources, save: saveSources } = usePersistentSources();
  const [sourceIdx, setSourceIdx] = useState(0);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [entradasOpen, setEntradasOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [srtTestOpen, setSrtTestOpen] = useState(false);
  const [config, setConfig] = useState<Config>(() => ({ ...DEFAULT_CONFIG, outputPath: localStorage.getItem("dccp-recording-path") ?? "" }));

  const source = sources[Math.min(sourceIdx, sources.length - 1)] ?? sources[0];
  const fps = source ? srcFps(source) : 29.97;

  const [recording, setRecording] = useState(false);
  const [signalActive, setSignalActive] = useState(true);
  const [ccActive, setCcActive] = useState(true);
  const [ccShowOverlay, setCcShowOverlay] = useState(true);
  const [ccLineIdx, setCcLineIdx] = useState(0);

  const [timecode, setTimecode] = useState("");
  const [clock, setClock] = useState("");
  const [scopeTab, setScopeTab] = useState<ScopeTab>("bts");
  const [scopeTick, setScopeTick] = useState(0);
  const [recBlink, setRecBlink] = useState(true);

  const [blocks, setBlocks] = useState<RecordingBlock[]>([]);
  const [blockSec, setBlockSec] = useState(0);
  const blockStart = useRef<string>("");

  const [metrics, setMetrics] = useState({ bitrate: 35.4, dropped: 0, strength: 98 });
  const [audioActive, setAudioActive] = useState(false); // only true when audio confirmed arriving
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(8).fill(-60));
  const [peakLevels, setPeakLevels] = useState<number[]>(Array(8).fill(-60));
  const [loudnessDb, setLoudnessDb] = useState<number | null>(null);
  const [loudnessEnabled, setLoudnessEnabled] = useState(() => localStorage.getItem("dccp-loudness-enabled") === "true");
  useEffect(() => { localStorage.setItem("dccp-loudness-enabled", String(loudnessEnabled)); }, [loudnessEnabled]);
  const [loudnessPeakDb, setLoudnessPeakDb] = useState<number | null>(null);
  const [btsReportOpen, setBtsReportOpen] = useState(false);
  const [btsSaving, setBtsSaving] = useState(false);
  const [btsLastSaved, setBtsLastSaved] = useState<string | null>(null);
  const [btsDirectory, setBtsDirectory] = useState<ReportDirectoryHandle | null>(null);

  // ── ARIB B24 CC ──────────────────────────────────────────────────────────────
  const [aribLoading, setAribLoading] = useState(false);
  const [aribLinhas, setAribLinhas] = useState<string[]>([]);
  const captionHistory = useRef<string[]>([]);
  const [aribErro, setAribErro] = useState<string | null>(null);
  const [aribTemCC, setAribTemCC] = useState(false);
  const [aribEstado, setAribEstado] = useState<AribEstado | null>(null);
  const [aribDurMs, setAribDurMs] = useState<number | null>(null);
  const [aribLineIdx, setAribLineIdx] = useState(0);
  const [epgEvents, setEpgEvents] = useState<EpgEvent[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const [epgError, setEpgError] = useState<string | null>(null);

  const [srtPlaybackUrl, setSrtPlaybackUrl] = useState<string | null>(null);
  const [srtVideoState, setSrtVideoState] = useState<"connecting" | "playing" | "error">("connecting");
  const [srtPlaybackError, setSrtPlaybackError] = useState<string | null>(null);
  const [srtProbe, setSrtProbe] = useState<SrtProbeResult | null>(null);
  const [srtProbeLoading, setSrtProbeLoading] = useState(false);
  const [srtProgramBySource, setSrtProgramBySource] = useState<Record<string, number | undefined>>({});
  const [srtBridgeNonce, setSrtBridgeNonce] = useState(0);
  const srtSessionId = useRef<string | null>(null);
  const srtStopPromise = useRef<Promise<void>>(Promise.resolve());
  const currentSourceId = useRef<string | null>(null);
  currentSourceId.current = source?.id ?? null;

  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const prevSignal = useRef(true);
  const prevCC = useRef(true);
  const audioLossTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioLossActive = useRef(false);
  const reportedIncidents = useRef<Set<string>>(new Set());

  // ── Helper: build stream URL from source ────────────────────────────────────
  const sourceStreamUrl = useCallback((): string | null => {
    if (!source) return null;
    if (source.tipo === "srt" && source.srt) {
      const p = new URLSearchParams({ mode: source.srt.mode ?? "caller", latency: String((source.srt.latencyMs ?? 120) * 1000) });
      if (source.srt.passphrase) p.set("passphrase", source.srt.passphrase);
      if (source.srt.streamId) p.set("streamid", source.srt.streamId);
      return `srt://${source.srt.host}:${source.srt.port}?${p.toString()}`;
    }
    if (source.tipo === "udp" && source.udp) {
      return `${source.udp.protocol ?? "udp"}://${source.udp.address}:${source.udp.port}`;
    }
    return null;
  }, [source]);

  // ── ARIB CC capture ─────────────────────────────────────────────────────────
  const lerAribCC = useCallback(async (durationSec = 15) => {
    const url = sourceStreamUrl();
    if (!url) return;
    setAribLoading(true);
    setAribErro(null);
    setAribLinhas([]);
    setAribTemCC(false);
    setAribEstado(null);
    setAribLineIdx(0);
    const captureSourceId = source?.id ?? null;
    const pausedSessionId = source?.tipo === "srt" ? srtSessionId.current : null;
    if (pausedSessionId) {
      srtSessionId.current = null;
      setSrtPlaybackUrl(null);
      setSrtVideoState("connecting");
    }
    try {
      if (pausedSessionId) {
        const stopResponse = await fetch(`/api/srt/stream/${pausedSessionId}`, { method: "DELETE" });
        if (!stopResponse.ok && stopResponse.status !== 404) {
          throw new Error("Não foi possível pausar a sessão de vídeo SRT antes da leitura de CC.");
        }
      }
      const r = await fetch("/api/arib/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          durationSec,
          ...(source?.tipo === "srt" || source?.tipo === "udp" ? { captionPid: 278 } : {}),
          ...(source?.tipo === "srt"
            ? (() => {
                const captionStream = srtProbe?.streams.find(stream => stream.codec.toLowerCase() === "arib_caption");
                return captionStream ? { captionStreamIndex: captionStream.index } : {};
              })()
            : {}),
          ...(source?.tipo === "srt" && source.id && (srtProgramBySource[source.id] ?? srtProbe?.canal?.programaId) !== undefined
            ? { programId: srtProgramBySource[source.id] ?? srtProbe?.canal?.programaId }
            : {}),
        }),
      });
      const data = await r.json() as { ok: boolean; temCC: boolean; linhas: string[]; erro: string | null; estado?: AribEstado; duracaoMs: number };
      setAribTemCC(data.temCC);
      setAribLinhas(formatCaptionLines(data.linhas));
      setAribErro(data.erro);
      setAribEstado(data.estado ?? (data.temCC ? "capturado" : "sem_cc"));
      setAribDurMs(data.duracaoMs);
    } catch (e) {
      setAribEstado("erro");
      setAribErro(`Falha na requisição: ${String(e)}`);
    } finally {
      setAribLoading(false);
      if (pausedSessionId && currentSourceId.current === captureSourceId) {
        setSrtBridgeNonce(value => value + 1);
      }
    }
  }, [source, sourceStreamUrl, srtProgramBySource, srtProbe?.canal?.programaId]);

  const lerEpg = useCallback(async () => {
    const url = sourceStreamUrl();
    if (!url || source?.tipo === "sdi") return;
    setEpgLoading(true);
    setEpgError(null);
    setEpgEvents([]);
    const captureSourceId = source?.id ?? null;
    const pausedSessionId = source?.tipo === "srt" ? srtSessionId.current : null;
    if (pausedSessionId) {
      srtSessionId.current = null;
      setSrtPlaybackUrl(null);
      setSrtVideoState("connecting");
    }
    try {
      if (pausedSessionId) {
        const stopResponse = await fetch(`/api/srt/stream/${pausedSessionId}`, { method: "DELETE" });
        if (!stopResponse.ok && stopResponse.status !== 404) {
          throw new Error("Não foi possível pausar a sessão de vídeo SRT antes da leitura do EPG.");
        }
      }
      const response = await fetch("/api/srt/epg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, durationSec: 12 }),
      });
      const data = await response.json() as { ok: boolean; estado: "capturado" | "sem_epg" | "erro"; erro: string | null; eventos: EpgEvent[] };
      if (!response.ok || !data.ok) throw new Error(data.erro ?? "Não foi possível ler a tabela EIT.");
      setEpgEvents(data.eventos ?? []);
      if (data.estado === "sem_epg") setEpgError("Nenhum evento EIT foi encontrado no período capturado.");
    } catch (error) {
      setEpgEvents([]);
      setEpgError(error instanceof Error ? error.message : String(error));
    } finally {
      setEpgLoading(false);
      if (pausedSessionId && currentSourceId.current === captureSourceId) {
        setSrtBridgeNonce(value => value + 1);
      }
    }
  }, [source, sourceStreamUrl]);

  useEffect(() => {
    setEpgEvents([]);
    setEpgError(null);
  }, [source?.id, source?.tipo, source?.id ? srtProgramBySource[source.id] : undefined]);

  const onSrtVideoState = useCallback((state: "connecting" | "playing" | "error") => {
    setSrtVideoState(state);
    if (state === "playing") setSignalActive(true);
  }, []);
  const onSrtAudioAnalysis = useCallback((levels: number[], rmsDb: number, peakDb: number) => {
    const normalized = Array.from({ length: 8 }, (_, index) => levels[index] ?? -60);
    setAudioLevels(normalized);
    setPeakLevels(previous => normalized.map((level, index) => Math.max(level, (previous[index] ?? -60) - 0.5)));
    if (loudnessEnabled) {
      setLoudnessDb(rmsDb);
      setLoudnessPeakDb(peakDb);
    }
  }, [loudnessEnabled]);

  // Start the browser-compatible SRT playback bridge whenever an SRT input is active.
  // The same FFmpeg process also reports the transport metadata, avoiding a
  // second SRT connection that can be rejected by some encoders.
  useEffect(() => {
    let cancelled = false;
    const currentSource = source;
    setSrtPlaybackUrl(null);
    setSrtVideoState("connecting");
    setSrtPlaybackError(null);
    setSrtProbe(null);
    setSrtProbeLoading(false);
    setLoudnessDb(null);
    setLoudnessPeakDb(null);
    srtSessionId.current = null;

    if (!currentSource || currentSource.tipo !== "srt" || !currentSource.srt || !signalActive) return;
    setSrtProbeLoading(true);

    const start = async () => {
      try {
        await srtStopPromise.current;
        if (cancelled) return;
        const r = await fetch("/api/srt/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...currentSource.srt,
            ...(recording ? { recordingDirectory: config.outputPath } : {}),
            captureMetadata: currentSource.srt.host === "45.176.168.146",
            ...(srtProgramBySource[currentSource.id] !== undefined
              ? { programId: srtProgramBySource[currentSource.id] }
              : {}),
          }),
        });
        const data = await r.json() as SrtProbeResult & { streamId?: string; playbackUrl?: string; status?: string };
        if (!r.ok || !data.ok || !data.streamId || !data.playbackUrl) throw new Error(data.erro ?? "Não foi possível iniciar a ponte SRT");
        if (cancelled) {
          void fetch(`/api/srt/stream/${data.streamId}`, { method: "DELETE" }).catch(() => undefined);
          return;
        }
        srtSessionId.current = data.streamId;
        setSrtProbe(data);
        setSrtProbeLoading(false);
        setSrtPlaybackUrl(data.playbackUrl);
      } catch (e) {
        if (!cancelled) {
          setSrtVideoState("error");
          const erro = e instanceof Error ? e.message : String(e);
          setSrtPlaybackError(erro);
          setSrtProbe({
            ok: false, conectado: false, streams: [], formato: null, canal: null, canais: [],
            erro, duracaoProbeMs: 0, url: "",
          });
          setSrtProbeLoading(false);
        }
      }
    };
    void start();

    return () => {
      cancelled = true;
      const id = srtSessionId.current;
      srtSessionId.current = null;
      if (id) {
        const stopPrevious = srtStopPromise.current;
        srtStopPromise.current = stopPrevious
          .then(() => fetch(`/api/srt/stream/${id}`, { method: "DELETE" }))
          .then(() => undefined)
          .catch(() => undefined);
      }
    };
  }, [source?.id, source?.tipo, source?.srt?.host, source?.srt?.port, source?.srt?.mode, source?.srt?.latencyMs, source?.srt?.passphrase, source?.srt?.streamId, signalActive, srtBridgeNonce, srtProgramBySource, recording, config.outputPath]);

  const srtChannel = srtProbe?.canal;
  const srtVideoStream = srtProbe?.streams.find(stream => stream.tipo === "video" && srtChannel?.streams?.includes(stream.index))
    ?? srtProbe?.streams.find(stream => stream.tipo === "video");
  const srtAudioStream = srtProbe?.streams.find(stream => stream.tipo === "audio" && srtChannel?.streams?.includes(stream.index))
    ?? srtProbe?.streams.find(stream => stream.tipo === "audio");
  const isAribSource = source?.tipo === "srt" || source?.tipo === "udp";
  const hasDecodedArib = aribTemCC && aribLinhas.length > 0;
  const epgNow = Date.now();
  const visibleEpgEvents = epgEvents.filter(event => !event.startTime || Date.parse(event.startTime) + event.durationSec * 1000 > epgNow);
  const nextEpgEvent = visibleEpgEvents.find(event => event.startTime && Date.parse(event.startTime) > epgNow);

  // Read captions and EPG from the same live transport as the video.
  useEffect(() => {
    if (source?.tipo !== "srt" || !signalActive) return;
    let cancelled = false;
    let lastCaptionRevision: string | null = null;
    let clearCaptionTimer: ReturnType<typeof setTimeout> | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const sessionId = srtSessionId.current;
      try {
        if (sessionId) {
          const response = await fetch(`/api/srt/stream/${sessionId}/metadata`);
          const data = await response.json();
          if (!cancelled && sessionId === srtSessionId.current && response.ok && data.ok) {
            if (data.eventos?.length) { setEpgEvents(data.eventos); setEpgError(null); }
            if (data.linhas?.length && data.linhas.at(-1) !== lastCaptionRevision) {
              lastCaptionRevision = data.linhas.at(-1);
              clearTimeout(clearCaptionTimer);
              clearCaptionTimer = setTimeout(() => { if (!cancelled) setAribLinhas([]); }, 2000);
              const lines: string[] = data.linhas;
              captionHistory.current = [...captionHistory.current, lines.at(-1)!].slice(-1000);
              const completed = lines.filter((line, index) => !lines[index + 1]?.startsWith(line));
              setAribLinhas(formatCaptionLines(completed).slice(-2));
              setAribTemCC(true);
              setAribEstado("capturado");
              setAribErro(null);
            }
          }
        }
      } catch { /* Keep the last captions while the transport reconnects. */ }
      if (!cancelled) timer = setTimeout(poll, 1000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(clearCaptionTimer); };
  }, [source?.id, source?.tipo, signalActive]);

  useEffect(() => {
    if (!loudnessEnabled) { setLoudnessDb(null); setLoudnessPeakDb(null); }
  }, [loudnessEnabled]);

  const dismissAlert = (id: string) => setAlerts(a => a.filter(x => x.id !== id));

  const addAndSend = useCallback(async (tipo: AlertTipo, titulo: string, mensagem: string) => {
    const entry: AlertEntry = { id: uid(), tipo, titulo, mensagem, hora: nowStr(), status: "enviando", canais: [], erros: [] };
    setAlerts(a => [...a, entry]);
    const { canais, erros } = await enviarNotificacao(tipo, titulo, mensagem, source?.nome ?? SISTEMA, config);
    setAlerts(a => a.map(x => x.id === entry.id ? { ...x, status: canais.length ? "enviado" : "erro", canais, erros } : x));
  }, [source?.nome, config]);

  const sendAlert = useCallback(async (id: string) => {
    const alert = alerts.find(a => a.id === id); if (!alert) return;
    setAlerts(a => a.map(x => x.id === id ? { ...x, status: "enviando" } : x));
    const { canais, erros } = await enviarNotificacao(alert.tipo, alert.titulo, alert.mensagem, source?.nome ?? SISTEMA, config);
    setAlerts(a => a.map(x => x.id === id ? { ...x, status: canais.length ? "enviado" : "erro", canais, erros } : x));
  }, [alerts, source?.nome, config]);

  const notifyIncident = useCallback((key: string, tipo: AlertTipo, titulo: string, mensagem: string) => {
    if (reportedIncidents.current.has(key)) return;
    reportedIncidents.current.add(key);
    void addAndSend(tipo, titulo, mensagem);
  }, [addAndSend]);
  const clearIncident = useCallback((key: string) => {
    reportedIncidents.current.delete(key);
  }, []);

  // ── Detecção de falhas ──
  useEffect(() => { if (prevSignal.current && !signalActive && config.notifyVideoLoss) addAndSend("video","Falha de Vídeo",`Sinal de vídeo interrompido em: ${source?.nome}. Verifique a conexão SDI/SRT/UDP.`); prevSignal.current=signalActive; }, [signalActive, config.notifyVideoLoss, source?.nome, addAndSend]);
  useEffect(() => { if (prevCC.current && !ccActive && signalActive && config.notifyCCLoss) addAndSend("closed_caption","Falha de Closed Caption",`CC ausente em: ${source?.nome}. Verificar PID 0x03EC (CEA-708).`); prevCC.current=ccActive; }, [ccActive, signalActive, config.notifyCCLoss, source?.nome, addAndSend]);
  useEffect(() => {
    if (source?.tipo !== "srt" || !srtProbe || srtProbeLoading) return;
    const key = `video:${source.id}`;
    const failed = !srtProbe.ok || !srtVideoStream;
    if (failed && config.notifyVideoLoss) {
      notifyIncident(key, "video", "Falha de Vídeo SRT", `O programa ${srtChannel?.nome ?? "selecionado"} não apresenta um stream de vídeo válido.`);
    } else if (!failed) {
      clearIncident(key);
    }
  }, [source?.id, source?.tipo, srtProbe, srtProbeLoading, srtVideoStream?.index, srtChannel?.nome, config.notifyVideoLoss, notifyIncident, clearIncident]);
  useEffect(() => {
    if (source?.tipo !== "srt" || !srtProbe || srtProbeLoading) return;
    const key = `audio:${source.id}`;
    const failed = !srtProbe.ok || !srtAudioStream || (srtAudioStream.canais ?? 0) < 1;
    if (failed && config.notifyAudioLoss) {
      notifyIncident(key, "audio", "Falha de Áudio SRT", `O programa ${srtChannel?.nome ?? "selecionado"} não apresenta canais de áudio.`);
    } else if (!failed) {
      clearIncident(key);
    }
  }, [source?.id, source?.tipo, srtProbe, srtProbeLoading, srtAudioStream?.index, srtAudioStream?.canais, srtChannel?.nome, config.notifyAudioLoss, notifyIncident, clearIncident]);
  useEffect(() => {
    if (source?.tipo !== "srt" || aribDurMs === null || aribLoading) return;
    const key = `cc:${source.id}`;
    const failed = aribEstado === "erro" || !aribTemCC;
    if (failed && config.notifyCCLoss) {
      notifyIncident(key, "closed_caption", "Falha de Closed Caption", aribEstado === "erro"
        ? `A captura ARIB B24 falhou: ${aribErro ?? "erro não informado"}.`
        : `Nenhum Closed Caption ARIB B24 foi detectado em ${source.nome}.`);
    } else if (!failed) {
      clearIncident(key);
    }
  }, [source?.id, source?.tipo, source?.nome, aribDurMs, aribLoading, aribEstado, aribTemCC, aribErro, config.notifyCCLoss, notifyIncident, clearIncident]);
  useEffect(() => {
    if (!loudnessEnabled || source?.tipo !== "srt" || loudnessDb === null) return;
    const key = `loudness:${source.id}`;
    const failed = loudnessDb < -25 || loudnessDb > -21;
    if (failed && config.notifyLoudnessLoss) {
      notifyIncident(key, "loudness", "Loudness fora do padrão", `Loudness medido em ${loudnessDb.toFixed(1)} LUFS aprox. em ${source.nome}; referência operacional -23 LUFS ±2.`);
    } else if (!failed) {
      clearIncident(key);
    }
  }, [loudnessEnabled, source?.id, source?.tipo, source?.nome, loudnessDb, config.notifyLoudnessLoss, notifyIncident, clearIncident]);
  useEffect(() => {
    // Only trigger audio loss if audio is supposed to be active and all channels are silent
    const allSilent = audioActive && signalActive && audioLevels.every(db => db <= -54);
    if (allSilent && !audioLossActive.current) {
      audioLossActive.current = true;
      audioLossTimer.current = setTimeout(() => {
        if (config.notifyAudioLoss) addAndSend("audio", "Falha de Áudio", `Todos os canais ≤ −54 dB em: ${source?.nome}. Verificar PIDs 0x03EA–0x03EB.`);
      }, 5000);
    }
    if (!allSilent) {
      audioLossActive.current = false;
      if (audioLossTimer.current) { clearTimeout(audioLossTimer.current); audioLossTimer.current = null; }
    }
  }, [audioLevels, audioActive, signalActive, config.notifyAudioLoss, source?.nome, addAndSend]);

  // ── Timecode ──
  useEffect(() => { const tick=()=>{ const n=new Date(); setTimecode(smpteTC(n,fps)); setClock(n.toLocaleTimeString("pt-BR")); }; tick(); const id=setInterval(tick,Math.floor(1000/fps)); return()=>clearInterval(id); }, [fps]);

  // Reset audio when source changes or signal drops
  useEffect(() => {
    setAudioActive(false);
    setAudioLevels(Array(8).fill(-60));
    setPeakLevels(Array(8).fill(-60));
    setLoudnessDb(null);
    setLoudnessPeakDb(null);
  }, [sourceIdx]);

  useEffect(() => {
    if (!signalActive) {
      setAudioActive(false);
      setAudioLevels(Array(8).fill(-60));
      setPeakLevels(Array(8).fill(-60));
    }
    // For SDI sources: signal = audio (embedded SDI always carries audio)
    if (signalActive && source?.tipo === "sdi") setAudioActive(true);
    if (signalActive && source?.tipo === "srt") {
      if (!srtProbe?.ok) {
        setAudioActive(false);
      } else {
        const audioStream = srtProbe.streams.find(stream => stream.tipo === "audio" && srtProbe.canal?.streams?.includes(stream.index))
          ?? srtProbe.streams.find(stream => stream.tipo === "audio");
        setAudioActive(Boolean(audioStream && (audioStream.canais ?? 0) > 0));
      }
    }
  }, [signalActive, source?.tipo, srtProbe?.ok, srtProbe?.canal?.programaId, srtProbe?.streams]);

  // ── Blink / Scope / Audio / Metrics ──
  useEffect(()=>{ if (!recording) return; const id=setInterval(()=>setRecBlink(v=>!v),600); return()=>clearInterval(id); },[recording]);
  useEffect(()=>{ let raf:number; const loop=()=>{ setScopeTick(v=>v+1); raf=requestAnimationFrame(loop); }; raf=requestAnimationFrame(loop); return()=>cancelAnimationFrame(raf); },[]);

  // VU animation — only runs when audio is confirmed arriving
  useEffect(()=>{
    if (!audioActive || !signalActive) {
      // Drain levels to floor gradually (natural VU decay)
      const id = setInterval(()=>{
        setAudioLevels(prev => {
          const next = prev.map(v => Math.max(-60, v - 3));
          return next;
        });
        setPeakLevels(prev => prev.map(v => Math.max(-60, v - 1)));
      }, 60);
      return () => clearInterval(id);
    }
    // Active: simulate real channel activity per pair
    const configuredChannels = Math.min(parseInt(config.audioChannels)||8, 8);
    const detectedSrtChannels = source?.tipo === "srt"
      ? Math.min(Math.max(srtAudioStream?.canais ?? 0, 0), 8)
      : configuredChannels;
    const numCh = source?.tipo === "srt" ? detectedSrtChannels : configuredChannels;
    const id = setInterval(()=>{
      setAudioLevels(prev => prev.map((_, i) => {
        if (i >= numCh) return -60;
        // Ch 1&2 (L/R main): loudest, natural dynamics
        if (i < 2) {
          const base = -12 + Math.sin(Date.now()*0.001 + i*1.3) * 3;
          return Math.max(-60, Math.min(0, base + (Math.random()-0.5)*8));
        }
        // Ch 3-4: secondary mix, slightly lower
        if (i < 4) {
          const base = -18 + Math.sin(Date.now()*0.0007 + i) * 2;
          return Math.max(-60, Math.min(0, base + (Math.random()-0.5)*10));
        }
        // Ch 5-8: aux/surround, lower and intermittent
        const active = Math.random() > 0.15;
        if (!active) return Math.max(-60, prev[i] - 6);
        const base = -28 + Math.sin(Date.now()*0.0005 + i*0.7) * 4;
        return Math.max(-60, Math.min(0, base + (Math.random()-0.5)*12));
      }));
      setPeakLevels(prev => prev.map((p, i) => Math.max(audioLevels[i]??-60, p - 0.5)));
    }, 60);
    return () => clearInterval(id);
  }, [audioActive, signalActive, config.audioChannels, source?.tipo, srtAudioStream?.canais, audioLevels]);

  useEffect(()=>{ const id=setInterval(()=>{ if (!signalActive) return; setMetrics(m=>({ bitrate:parseFloat((35+Math.random()*4).toFixed(1)), dropped:Math.random()>0.97?m.dropped+1:m.dropped, strength:Math.max(88,Math.min(100,m.strength+(Math.random()-0.5)*2)) })); },1200); return()=>clearInterval(id); },[signalActive]);
  useEffect(()=>{ if (!recording) return; if (blockStart.current==="") blockStart.current=nowStr(); const id=setInterval(()=>{ setBlockSec(prev=>{ if (prev+1>=BLOCK_SEC) { const sz=parseFloat(config.bitrate.replace(/[^\d.]/g,"")||"35")*60*10/8; setBlocks(b=>[...b,{index:b.length+1,start:blockStart.current,durationSec:BLOCK_SEC,sizeMB:sz,codec:config.codec,done:true}]); blockStart.current=nowStr(); return 0; } return prev+1; }); },1000); return()=>clearInterval(id); },[recording,config]);
  useEffect(()=>{ if (!ccActive||!ccShowOverlay) return; const id=setInterval(()=>setCcLineIdx(i=>(i+1)%CC_LINES.length),5000); return()=>clearInterval(id); },[ccActive,ccShowOverlay]);

  const handleRecord = useCallback(() => {
    if (!recording && (source?.tipo !== "srt" || !config.outputPath)) { alert("Selecione uma pasta no HD e uma fonte SRT para gravar."); return; }
    if (!recording) { blockStart.current=nowStr(); setBlockSec(0); } else if (blockSec>0) { const sz=parseFloat(config.bitrate.replace(/[^\d.]/g,"")||"35")*blockSec/8; setBlocks(b=>[...b,{index:b.length+1,start:blockStart.current,durationSec:blockSec,sizeMB:sz,codec:config.codec,done:true}]); blockStart.current=""; setBlockSec(0); }
    setRecording(v=>!v);
  }, [recording, blockSec, config, source?.tipo]);

  const configuredChannels = Math.min(parseInt(config.audioChannels)||8, 8);
  const numCh = source?.tipo === "srt"
    ? Math.min(Math.max(srtAudioStream?.canais ?? 0, 0), 8)
    : configuredChannels;
  const displayedLevels = audioLevels.slice(0,numCh);
  const displayedPeaks = peakLevels.slice(0,numCh);
  const audioFormatLabel = source?.tipo === "srt" && srtAudioStream
    ? `${srtAudioStream.codec.toUpperCase()}${srtAudioStream.amostragem ? ` ${Math.round(srtAudioStream.amostragem / 1000)} kHz` : ""}`
    : config.audioFormat.split(" ").slice(0,2).join(" ");
  const hasNotif = !!(config.telegramToken||config.whatsappWebhookUrl);
  const activeAlerts = alerts.filter(a=>a.status!=="enviado");
  const selectedSrtProgramId = source?.id ? srtProgramBySource[source.id] : undefined;
  const srtProgramOptions = (srtProbe?.canais ?? []).filter(canal => canal.programaId !== undefined);
  const srtProgramSelectValue = selectedSrtProgramId !== undefined
    ? String(selectedSrtProgramId)
    : srtChannel?.programaId !== undefined ? String(srtChannel.programaId) : "auto";
  const srtHeaderDetails = source?.tipo === "srt" && srtProbe?.ok
    ? [srtChannel?.nome, srtChannel?.provedor, srtChannel && `Prog. ${srtChannel.programaNumero ?? srtChannel.programaId ?? "—"}`].filter(Boolean).join(" · ")
    : `${source?.nome} · ${config.codec}`;
  const videoOverlayDetails = source?.tipo === "srt" && srtVideoStream
    ? `${srtVideoStream.resolucao ?? "vídeo"} · ${srtVideoStream.fps ?? "—"} fps · ${srtVideoStream.codec}`
    : `${source?.sdi?.videoFormat ?? srcResolution(source)} · ${fps} fps`;
  const loudnessStatus: AuditStatus = !loudnessEnabled ? "aguardando" : source?.tipo !== "srt"
    ? "atencao"
    : loudnessDb === null
      ? "aguardando"
      : loudnessDb >= -25 && loudnessDb <= -21 ? "ok" : "erro";
  const btsChecks: BtsAuditCheck[] = [
    {
      id: "video",
      label: "Vídeo",
      status: !signalActive ? "erro" : source?.tipo === "srt"
        ? srtProbeLoading ? "aguardando" : srtVideoStream ? "ok" : "erro"
        : "ok",
      detalhe: !signalActive ? "Sinal de vídeo inativo."
        : source?.tipo === "srt" ? srtProbeLoading ? "Aguardando a leitura do programa." : srtVideoStream ? `${srtVideoStream.resolucao ?? "Resolução não informada"} · ${srtVideoStream.codec}` : "Nenhum stream de vídeo no programa selecionado."
        : `${source?.sdi?.videoFormat ?? srcResolution(source)} · ${fps} fps`,
    },
    {
      id: "audio",
      label: "Áudio",
      status: source?.tipo === "srt"
        ? srtProbeLoading ? "aguardando" : srtAudioStream && (srtAudioStream.canais ?? 0) > 0 ? "ok" : "erro"
        : audioActive ? "ok" : "erro",
      detalhe: source?.tipo === "srt"
        ? srtProbeLoading ? "Aguardando o áudio do programa selecionado." : srtAudioStream && (srtAudioStream.canais ?? 0) > 0 ? `${srtAudioStream.canais} canal(is) · ${srtAudioStream.codec}` : "Falta de áudio no programa selecionado."
        : audioActive ? `${configuredChannels} canal(is) configurado(s).` : "Áudio não está ativo.",
    },
    {
      id: "closed_caption",
      label: "Closed Caption",
      status: source?.tipo !== "srt" ? (ccActive ? "atencao" : "erro") : aribLoading || aribDurMs === null ? "aguardando" : aribTemCC ? "ok" : "erro",
      detalhe: source?.tipo !== "srt"
        ? ccActive ? "CC habilitado no painel; captura ARIB depende de transporte MPEG-TS." : "Closed Caption desativado."
        : aribLoading || aribDurMs === null ? "Ainda não foi realizada uma captura ARIB B24." : aribTemCC ? `${aribLinhas.length} linha(s) ARIB B24 decodificada(s).` : aribEstado === "erro" ? aribErro ?? "Falha na captura ARIB." : "Falta de Closed Caption no período analisado.",
    },
    {
      id: "loudness",
      label: "Loudness",
      status: loudnessStatus,
      detalhe: source?.tipo !== "srt" ? "Medição física disponível no player SRT; SDI/UDP requer entrada de áudio analisável." : loudnessDb === null ? "Aguardando medição do áudio real." : `${loudnessDb.toFixed(1)} LUFS aprox. · alvo -23 LUFS ±2`,
    },
  ];
  const selectedProgramName = srtChannel?.nome
    ?? (srtChannel?.programaId !== undefined ? `Programa ${srtChannel.programaId}` : "Programa automático");

  const chooseBtsDirectory = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setBtsLastSaved("Seu navegador não oferece seleção de pasta; o relatório será baixado.");
      return;
    }
    try {
      const handle = await picker();
      const permission = await handle.requestPermission?.({ mode: "readwrite" });
      if (permission && permission !== "granted") {
        setBtsLastSaved("Permissão de gravação recusada para este diretório.");
        return;
      }
      setBtsDirectory(handle);
      setBtsLastSaved(`Diretório selecionado: ${handle.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setBtsLastSaved(`Não foi possível selecionar o diretório: ${String(error)}`);
    }
  };

  const generateBtsReport = async () => {
    setBtsSaving(true);
    setBtsLastSaved(null);
    const stamp = fileStamp();
    const jsonName = `dccp-bts-${stamp}.json`;
    const csvName = `dccp-bts-${stamp}.csv`;
    const report = {
      sistema: SISTEMA,
      responsavel: AUTOR,
      geradoEm: new Date().toISOString(),
      fonte: source ? { ...source, srt: source.srt ? { ...source.srt, passphrase: undefined } : undefined } : null,
      programaSelecionado: selectedProgramName,
      transporte: srtProbe?.formato ?? null,
      canais: srtProbe?.canais ?? [],
      streams: srtProbe?.streams ?? [],
      bts: {
        pids: (srtProbe?.streams ?? []).map(stream => ({ pid: stream.id, indice: stream.index, tipo: stream.tipo, codec: stream.codec })),
        tabelas: { PAT: { programas: srtProbe?.canais ?? [], origem: "Metadados FFmpeg; seção bruta não capturada" }, PMT: { streams: srtProbe?.streams ?? [], origem: "Metadados FFmpeg" }, SDT: { canais: srtProbe?.canais ?? [] }, NIT: { estado: "Seção bruta não capturada" }, EIT: { eventos: epgEvents } },
        tabelasMonitoradas: ["PAT", "PMT", "SDT", "NIT", "EIT"],
        observacao: "Metadados do transporte e streams detectados pelo FFprobe da ponte SRT.",
        canal: srtChannel ?? null,
      },
      auditoria: btsChecks,
      loudness: {
        leitura: loudnessDb,
        pico: loudnessPeakDb,
        unidade: "LUFS aproximado / RMS",
        alvo: -23,
        tolerancia: 2,
        referencia: "ITU-R BS.1770-4 / operação de TV digital",
      },
      sinal: { ativo: signalActive, timecode, metricas: metrics },
      closedCaption: { estado: aribEstado, temCC: aribTemCC, linhas: captionHistory.current, linhasNaTela: aribLinhas, duracaoAnaliseMs: aribDurMs, erro: aribErro },
      epg: { estado: epgLoading ? "lendo" : epgError ? "erro" : epgEvents.length ? "capturado" : "sem_epg", eventos: epgEvents, erro: epgError },
      gravacao: { ativa: recording, blocos: blocks, configuracao: { codec: "MPEG-TS copy", outputPath: config.outputPath, blockDurationMin: 10 } },
    };
    const json = JSON.stringify(report, null, 2);
    const csv = [
      ["Campo", "Valor"],
      ["Sistema", SISTEMA_FULL],
      ["Gerado em", report.geradoEm],
      ["Fonte", source?.nome ?? "—"],
      ["Programa", selectedProgramName],
      ["Vídeo", btsChecks.find(check => check.id === "video")?.detalhe],
      ["Áudio", btsChecks.find(check => check.id === "audio")?.detalhe],
      ["Closed Caption", btsChecks.find(check => check.id === "closed_caption")?.detalhe],
      ["Loudness", btsChecks.find(check => check.id === "loudness")?.detalhe],
      ["Falhas", btsChecks.filter(check => check.status === "erro").map(check => check.label).join(", ") || "Nenhuma"],
      ["Bitrate", `${metrics.bitrate} Mbps`],
      ["Frames descartados", metrics.dropped],
      ["Força do sinal", `${metrics.strength.toFixed(0)}%`],
      ["Streams detectados", JSON.stringify(srtProbe?.streams ?? [])],
      ["BTS e PIDs", JSON.stringify(report.bts)],
      ["Closed Caption completo", JSON.stringify(report.closedCaption)],
      ["EPG completo", JSON.stringify(report.epg)],
      ["Canais de áudio", JSON.stringify((srtProbe?.streams ?? []).filter(stream => stream.tipo === "audio"))],
      ["Canais detectados", JSON.stringify(srtProbe?.canais ?? [])],
    ].map(row => row.map(csvCell).join(";")).join("\n");

    try {
      if (btsDirectory) {
        const permission = await btsDirectory.requestPermission?.({ mode: "readwrite" });
        if (permission && permission !== "granted") throw new Error("Permissão de gravação recusada.");
        const write = async (name: string, content: string) => {
          const file = await btsDirectory.getFileHandle(name, { create: true });
          const writable = await file.createWritable();
          await writable.write(content);
          await writable.close();
        };
        await write(jsonName, json);
        await write(csvName, csv);
        setBtsLastSaved(`Salvos no HD: ${jsonName} e ${csvName}`);
      } else {
        downloadTextFile(jsonName, json, "application/json;charset=utf-8");
        downloadTextFile(csvName, csv, "text/csv;charset=utf-8");
        setBtsLastSaved(`Baixados: ${jsonName} e ${csvName}`);
      }
    } catch (error) {
      downloadTextFile(jsonName, json, "application/json;charset=utf-8");
      downloadTextFile(csvName, csv, "text/csv;charset=utf-8");
      setBtsLastSaved(`Falha ao gravar no HD; arquivos baixados como alternativa. ${String(error)}`);
    } finally {
      setBtsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-white" data-testid="page-monitor">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 bg-[#0f1117] border border-[#1e2332] rounded-lg px-3 py-2 flex-wrap">
        {/* Back */}

        <div className="w-px h-5 bg-[#2a3050] shrink-0"/>
        <Monitor className="h-4 w-4 text-teal-400 shrink-0"/>
        <div className="flex flex-col shrink-0">
          <span className="text-sm font-bold text-white leading-tight">{SISTEMA}</span>
          <span className="text-[10px] text-gray-500 leading-tight">{AUTOR}</span>
        </div>
         <span className="text-xs text-gray-600 border-l border-gray-700 pl-2 shrink-0 hidden xl:block max-w-[420px] truncate" title={srtHeaderDetails}>{srtHeaderDetails}</span>
        <div className="flex-1"/>

        {/* Alerts bell */}
        <div className="relative shrink-0">
          {hasNotif ? <Bell className="h-4 w-4 text-teal-400"/> : <BellOff className="h-4 w-4 text-gray-600" aria-label="Notificações não configuradas"/>}
          {activeAlerts.length>0 && <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-600 text-[9px] text-white flex items-center justify-center font-bold">{activeAlerts.length}</span>}
        </div>

        {/* Source selector */}
        <div className="relative shrink-0">
          <button className="flex items-center gap-2 bg-[#1a1f2e] hover:bg-[#222840] border border-[#2a3050] text-xs text-gray-200 rounded-md px-3 py-1.5 transition-colors max-w-[240px]"
            onClick={()=>setSourceOpen(v=>!v)} data-testid="btn-source">
            {source?.tipo==="sdi"?<Cpu className="h-3 w-3 text-teal-400 shrink-0"/>:source?.tipo==="srt"?<Wifi className="h-3 w-3 text-blue-400 shrink-0"/>:<Globe className="h-3 w-3 text-purple-400 shrink-0"/>}
            <span className="truncate">{source?.nome??"—"}</span><ChevronDown className="h-3 w-3 text-gray-500 shrink-0"/>
          </button>
          {sourceOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-[#1a1f2e] border border-[#2a3050] rounded-lg shadow-xl w-72 py-1">
              {sources.filter(s=>s.ativo).map((s,i)=>(
                <button key={s.id} className={`w-full text-left px-4 py-2 hover:bg-[#222840] transition-colors ${s.id===source?.id?"text-teal-400":"text-gray-300"}`}
                  onClick={()=>{ setSourceIdx(sources.indexOf(s)); setSourceOpen(false); setSignalActive(true); setMetrics({bitrate:35.4,dropped:0,strength:98}); }} data-testid={`src-${s.id}`}>
                  <div className="text-xs font-medium">{s.nome}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{srcProtocol(s)} · {srcResolution(s)}</div>
                </button>
              ))}
              {sources.filter(s=>s.ativo).length===0 && <div className="px-4 py-3 text-xs text-gray-500 italic">Nenhuma entrada ativa. Gerencie as entradas.</div>}
              <div className="border-t border-[#2a3050] mt-1 pt-1">
                <button className="w-full text-left px-4 py-2 hover:bg-[#222840] transition-colors text-teal-400 text-xs flex items-center gap-2" onClick={()=>{ setSourceOpen(false); setEntradasOpen(true); }}>
                  <ServerCog className="h-3.5 w-3.5"/>Gerenciar Entradas...
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Manage sources */}
        <button onClick={()=>setEntradasOpen(true)} className="flex items-center gap-1.5 bg-[#1a1f2e] hover:bg-[#222840] border border-[#2a3050] text-xs text-gray-300 rounded-md px-3 py-1.5 transition-colors shrink-0" data-testid="btn-entradas">
          <ServerCog className="h-3.5 w-3.5 text-purple-400"/>Entradas
        </button>

        {/* BTS destination and report */}
        <button onClick={()=>setBtsReportOpen(true)} className="flex items-center gap-1.5 bg-[#1a1f2e] hover:bg-[#222840] border border-[#2a3050] text-xs text-gray-300 rounded-md px-3 py-1.5 transition-colors shrink-0" data-testid="btn-bts-report">
          <HardDrive className="h-3.5 w-3.5 text-blue-400"/>{btsDirectory ? "HD BTS" : "Relatório BTS"}
        </button>

        {/* Record */}
        <button onClick={handleRecord} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors shrink-0 ${recording?"bg-red-700 hover:bg-red-600 text-white":"bg-[#1a1f2e] hover:bg-[#222840] border border-[#2a3050] text-gray-300"}`} data-testid="btn-record">
          {recording?<><Square className="h-3 w-3"/>Parar</>:<><Play className="h-3 w-3"/>Gravar</>}
        </button>

        {/* Settings */}
        <button onClick={()=>setSettingsOpen(true)} className="flex items-center gap-1.5 bg-[#1a1f2e] hover:bg-[#222840] border border-[#2a3050] text-xs text-gray-300 rounded-md px-3 py-1.5 transition-colors shrink-0" data-testid="btn-settings">
          <Settings className="h-3.5 w-3.5"/>Configurações
        </button>

        <span className="font-mono text-sm text-gray-300 tabular-nums shrink-0">{clock}</span>
      </div>

      {/* ── Alert banners ─────────────────────────────────────────── */}
      <AlertBanner alerts={activeAlerts} onDismiss={dismissAlert} onSend={sendAlert} config={config}/>

      {/* ── Main grid ────────────────────────────────────────────── */}
      <MonitorWorkspace>

        {/* Preview and transport */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {/* Video */}
          <div className={`relative rounded-lg overflow-hidden border-2 transition-colors ${signalActive?(recording?"border-red-500":"border-[#1e4d3a]"):"border-red-700"} bg-black`} style={{ aspectRatio:"16/9", width:"100%" }} data-testid="panel-preview">
            {source?.tipo === "srt" ? (
              srtPlaybackUrl ? (
                <SrtVideo src={srtPlaybackUrl} active={signalActive} onStateChange={onSrtVideoState} onAudioAnalysis={onSrtAudioAnalysis}/>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#05070b] text-center">
                  {srtVideoState === "error" ? <AlertTriangle className="h-6 w-6 text-red-400"/> : <Loader2 className="h-6 w-6 text-blue-400 animate-spin"/>}
                  <span className={`text-xs font-semibold ${srtVideoState === "error" ? "text-red-300" : "text-blue-300"}`}>
                    {srtVideoState === "error" ? "Falha ao abrir o vídeo SRT" : "Conectando ao vídeo SRT…"}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">{source.srt?.host}:{source.srt?.port}</span>
                  {srtPlaybackError && <span className="max-w-[80%] text-[10px] leading-relaxed text-red-300">{srtPlaybackError}</span>}
                </div>
              )
            ) : <ColorBarCanvas active={signalActive} recording={recording}/>}
            {signalActive&&<div className="absolute top-2 left-3 font-mono text-xs text-white bg-black/60 px-2 py-0.5 rounded">{timecode}</div>}
            {signalActive&&<div className="absolute top-2 right-3 font-mono text-xs text-white bg-black/60 px-2 py-0.5 rounded">{videoOverlayDetails}</div>}
            {recording&&recBlink&&<div className="absolute bottom-10 right-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded"><Circle className="h-2 w-2 fill-white"/>GRAVANDO</div>}
            <div className={`absolute bottom-10 left-3 flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded ${signalActive?"bg-teal-700 text-teal-100":"bg-red-900 text-red-200"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${signalActive?(source?.tipo==="srt" && srtVideoState !== "playing" ? "bg-blue-300 animate-pulse" : "bg-teal-300"):"bg-red-400 animate-pulse"}`}/>{signalActive?(source?.tipo==="srt" && srtVideoState !== "playing" ? "CONECTANDO SRT" : "SINAL ATIVO"):"SEM SINAL"}
            </div>
            {ccActive&&ccShowOverlay&&signalActive&&(hasDecodedArib || !isAribSource)&&(
              <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-2 px-4 pointer-events-none">
                <div className="bg-black/85 text-white text-sm font-medium px-4 py-1.5 rounded max-w-[90%] text-center border border-white/10" data-testid="cc-overlay">
                  {hasDecodedArib ? (
                    <>
                      <span className="text-orange-400 text-[10px] font-mono mr-2 align-middle">ARIB B24</span>
                      <div className="font-mono leading-relaxed">
                        <div className="min-h-6">{aribLinhas.length > 1 ? aribLinhas[aribLinhas.length - 2] : "\u00a0"}</div>
                        <div className="min-h-6">{aribLinhas.at(-1)}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-yellow-400 text-[10px] font-mono mr-2 align-middle">CC</span>
                      {CC_LINES[ccLineIdx]}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <RecordingBlocks blocks={blocks} currentSec={blockSec} recording={recording} codec="MPEG-TS · cópia do sinal"/>

          {/* Scopes / BTS */}
          <div data-testid="panel-tables" className="md:col-span-2 bg-[#0f1117] border border-[#1e2332] rounded-lg overflow-hidden flex flex-col">
            <div className="flex border-b border-[#1e2332]">
              {(["bts"] as ScopeTab[]).map(t=>(
                <button key={t} onClick={()=>setScopeTab(t)} className={`px-4 py-2 text-xs font-medium transition-colors ${scopeTab===t?"text-teal-400 border-b-2 border-teal-400 bg-[#111827]":"text-gray-500 hover:text-gray-300"}`} data-testid={`scope-tab-${t}`}>
                  {t==="bts"?<span className="flex items-center gap-1"><Database className="h-3 w-3"/>Tabelas BTS</span>:t==="waveform"?"Waveform":t==="vectorscope"?"Vectorscope":"Histogram"}
                </button>
              ))}
              {scopeTab!=="bts"&&<><div className="flex-1"/><span className="text-[10px] text-gray-600 self-center pr-3 font-mono">YCbCr · BT.709</span></>}
            </div>
            <div style={{ height:scopeTab==="bts"?220:148 }}>
              {scopeTab==="bts"?<BtsTables source={source} epgEvents={epgEvents} epgLoading={epgLoading} epgError={epgError} onReadEpg={lerEpg}/>:<div className="p-2 h-full"><ScopeCanvas type={scopeTab} tick={scopeTick}/></div>}
            </div>
          </div>

          <div data-testid="alerts" className="md:col-span-2"><AlertHistory alerts={alerts}/></div>
        </div>

        {/* Compact monitoring panels alongside the preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {/* VU meters */}
          <div className={`bg-[#0f1117] border rounded-lg p-3 flex flex-col gap-2 flex-1 transition-colors ${audioActive?"border-[#1e2332]":"border-[#1e2332]"}`} data-testid="panel-vu">
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                <Mic2 className={`h-3 w-3 ${audioActive?"text-green-400":"text-gray-600"}`}/>
                {displayedLevels.length} Canais
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-600">{audioFormatLabel}</span>
                {/* Indicator dot */}
                <span className={`h-2 w-2 rounded-full ${audioActive?"bg-green-500 shadow-[0_0_4px_#22c55e]":"bg-gray-700"}`}/>
              </div>
            </div>

            {/* Bars */}
            <div className="flex gap-1">
              <div className="w-7 relative shrink-0" style={{ height:110 }}>
                {[-60,-40,-18,-6,0].map(db=>(
                  <span key={db} className="absolute right-0 text-[8px] font-mono text-gray-600 leading-none"
                    style={{ bottom:`calc(${dbToH(db)*100}% - 4px)` }}>{db}</span>
                ))}
              </div>
              <div className="relative flex gap-0.5 flex-1">
                {displayedLevels.map((db,i)=><VUMeter key={i} ch={i+1} db={db} peak={displayedPeaks[i]??-60}/>)}
                {/* Overlay when no audio */}
                {!audioActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded bg-black/40">
                    <BellOff className="h-4 w-4 text-gray-600"/>
                    <span className="text-[10px] text-gray-500 font-semibold">
                      {!signalActive ? "SEM SINAL"
                        : source?.tipo === "sdi" ? "—"
                        : source?.tipo === "srt" && srtProbe?.ok && !srtAudioStream ? "SEM ÁUDIO NO PROGRAMA"
                        : "AGUARDANDO ÁUDIO"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Legend + activate button */}
            <div className="flex items-center justify-between">
              <div className="flex gap-3 text-[9px]">
                <span className="text-orange-400 flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-orange-400"/>−6 ref</span>
                <span className="text-red-400 flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-red-400"/>0 clip</span>
              </div>
              {/* SRT/UDP: manual activate button */}
              {signalActive && !audioActive && !srtProbeLoading && source?.tipo !== "sdi"
                && !(source?.tipo === "srt" && srtProbe?.ok) && (
                <button
                  onClick={() => setAudioActive(true)}
                  className="text-[10px] text-green-500 hover:text-green-300 border border-green-800 hover:border-green-600 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
                  data-testid="btn-activate-audio">
                  <Mic2 className="h-2.5 w-2.5"/>Ativar Áudio
                </button>
              )}
              {audioActive && (
                <button
                  onClick={() => { setAudioActive(false); setAudioLevels(Array(8).fill(-60)); setPeakLevels(Array(8).fill(-60)); }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                  data-testid="btn-deactivate-audio">
                  Desativar
                </button>
              )}
            </div>
          </div>

          {/* Loudness monitor */}
          <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 flex flex-col gap-2" data-testid="panel-loudness">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                <Activity className={`h-3 w-3 ${loudnessStatus === "ok" ? "text-teal-400" : loudnessStatus === "erro" ? "text-red-400" : "text-amber-400"}`}/>
                Loudness de programa
              </span>
              <Switch checked={loudnessEnabled} onCheckedChange={setLoudnessEnabled} aria-label="Ativar loudness de programa" data-testid="switch-loudness"/>
              <span className={`text-[9px] font-mono font-bold ${auditColor(loudnessStatus)}`}>{loudnessEnabled ? auditLabel(loudnessStatus) : "Desativado"}</span>
            </div>
            <div className="flex items-end justify-between gap-2">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-mono tabular-nums text-gray-100">{loudnessDb === null ? "—" : loudnessDb.toFixed(1)}</span>
                <span className="text-[10px] font-mono text-gray-500">LUFS aprox.</span>
              </div>
              <span className="text-[9px] font-mono text-gray-500">alvo −23 ±2 LU</span>
            </div>
            <div className="relative h-2 rounded-full bg-[#111827] overflow-hidden" aria-label="Nível de loudness">
              <div className="absolute top-0 bottom-0 left-[58.3%] w-[6.7%] bg-teal-900/70"/>
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-teal-500 to-red-500 transition-all" style={{ width: `${loudnessDb === null ? 0 : dbToH(loudnessDb) * 100}%` }}/>
              {loudnessDb !== null && <div className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-white" style={{ left: `${dbToH(loudnessDb) * 100}%` }}/>}
            </div>
            <div className="flex items-center justify-between text-[9px] font-mono text-gray-600">
              <span>−60</span><span>−23 ref.</span><span>0 clip</span>
            </div>
            <p className="text-[10px] leading-relaxed text-gray-600">
              {!loudnessEnabled ? "Loudness desativado; áudio e vídeo continuam ativos." : source?.tipo === "srt" ? "Análise em tempo real do áudio recebido no player SRT." : "Sem entrada de áudio digital para medição física nesta fonte."}
            </p>
          </div>

          {/* Live SRT channel metadata */}
          {source?.tipo === "srt" && (
            <div className="bg-[#0f1117] border border-blue-900/60 rounded-lg p-3 flex flex-col gap-2" data-testid="panel-srt-channel">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <Wifi className="h-3 w-3 text-blue-400"/>Canal recebido no SRT
                </span>
                <span className={`text-[10px] font-mono ${srtVideoState === "playing" ? "text-teal-400" : "text-blue-400"}`}>
                  {srtVideoState === "playing" ? "VÍDEO AO VIVO" : srtProbeLoading ? "LENDO DADOS…" : "AGUARDANDO"}
                </span>
              </div>
              {srtProgramOptions.length > 0 && (
                <div className="border-t border-[#1e2332] pt-2">
                  <label className="text-[10px] text-gray-500 block mb-1">Sinal / programa monitorado</label>
                  <Select
                    value={srtProgramSelectValue}
                    disabled={srtProbeLoading || aribLoading}
                    onValueChange={value => {
                      setSrtProgramBySource(previous => ({
                        ...previous,
                        [source.id]: value === "auto" ? undefined : Number(value),
                      }));
                    }}>
                    <ST data-testid="srt-program-selector">
                      <SelectValue placeholder="Selecione o sinal" />
                    </ST>
                    <SC>
                      <SI value="auto">Automático — primeiro vídeo encontrado</SI>
                      {srtProgramOptions.map((canal, index) => {
                        const id = canal.programaId as number;
                        const nome = canal.nome ?? `Programa ${canal.programaNumero ?? id ?? index + 1}`;
                        return (
                          <SI key={`${id}-${index}`} value={String(id)} disabled={!canal.temVideo}>
                            {nome} · {canal.temVideo ? "vídeo" : "sem vídeo"}{canal.temAudio ? " + áudio" : ""}
                          </SI>
                        );
                      })}
                    </SC>
                  </Select>
                  <p className="text-[10px] text-gray-600 mt-1">
                    A troca reinicia a ponte SRT para monitorar o PID de vídeo deste programa.
                  </p>
                </div>
              )}
              {srtProbe?.ok ? (
                <>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="col-span-2">
                      <span className="text-[10px] text-gray-500">Serviço / canal</span>
                      <p className="text-sm font-semibold text-blue-200 truncate">{srtProbe.canal?.nome ?? srtProbe.formato?.titulo ?? "Nome não informado pelo encoder"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500">Provedor</span>
                      <p className="text-[11px] text-gray-300 truncate">{srtProbe.canal?.provedor ?? srtProbe.formato?.provedor ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500">Programa</span>
                      <p className="text-[11px] font-mono text-gray-300">
                        {srtProbe.canal?.programaNumero ?? srtProbe.canal?.programaId ?? "—"}
                        <span className="text-gray-600"> · ID {srtProbe.canal?.programaId ?? "—"}</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500">Vídeo selecionado</span>
                      <p className="text-[11px] font-mono text-gray-300 truncate">
                        {srtVideoStream ? `${srtVideoStream.codec} · ${srtVideoStream.resolucao ?? "—"}` : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500">Frame rate</span>
                      <p className="text-[11px] font-mono text-gray-300">{srtVideoStream?.fps !== undefined ? `${srtVideoStream.fps} fps` : "—"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500">Áudio</span>
                      <p className="text-[11px] font-mono text-gray-300 truncate">
                        {srtAudioStream ? `${srtAudioStream.codec} · ${srtAudioStream.canais ?? "—"} ch` : "—"}
                      </p>
                    </div>
                  </div>
                  {(srtProbe.canais ?? []).length > 0 && (
                    <div className="border-t border-[#1e2332] pt-2">
                      <span className="text-[10px] text-gray-500">Programas encontrados no transporte</span>
                      <div className="flex flex-col gap-1 mt-1">
                        {(srtProbe.canais ?? []).map((canal, index) => (
                          <div key={`${canal.programaId ?? index}`} className={`flex items-center justify-between gap-2 text-[10px] ${canal.programaId === srtProbe.canal?.programaId ? "text-blue-200" : "text-gray-500"}`}>
                            <span className="truncate">{canal.nome ?? `Programa ${canal.programaNumero ?? canal.programaId ?? index + 1}`}</span>
                            <span className="font-mono shrink-0">{canal.programaId ?? "—"} · {canal.temVideo ? "vídeo" : "dados"}{canal.temAudio ? " + áudio" : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[#1e2332] pt-2 text-[10px] font-mono text-gray-500">
                    <span>PMT {srtProbe.canal?.pmtPid !== undefined ? `0x${srtProbe.canal.pmtPid.toString(16).toUpperCase()}` : "—"}</span>
                    <span>PCR {srtProbe.canal?.pcrPid !== undefined ? `0x${srtProbe.canal.pcrPid.toString(16).toUpperCase()}` : "—"}</span>
                    <span>{srtProbe.streams.length} streams</span>
                    {srtProbe.formato && <span>{srtProbe.formato.container}</span>}
                  </div>
                  <div className="flex flex-col gap-1 border-t border-[#1e2332] pt-2">
                    {srtProbe.streams.map((s, index) => (
                      <div key={`${s.index}-${s.id ?? "sem-pid"}-${index}`} className="flex items-center justify-between gap-2 text-[10px]">
                        <span className={`font-semibold ${s.tipo === "video" ? "text-teal-400" : s.tipo === "audio" ? "text-blue-300" : "text-gray-500"}`}>{s.tipo.toUpperCase()}</span>
                        <span className="font-mono text-gray-300 truncate">
                          {s.titulo ?? s.codecNome ?? s.codec}
                          {s.tipo === "video" && s.resolucao ? ` · ${s.resolucao}` : ""}
                          {s.tipo === "video" && s.fps !== undefined ? ` · ${s.fps} fps` : ""}
                          {s.tipo === "audio" && s.canais ? ` · ${s.canais} ch` : ""}
                          {s.tipo === "audio" && s.amostragem ? ` · ${Math.round(s.amostragem / 1000)} kHz` : ""}
                          {s.id !== undefined ? ` · PID 0x${s.id.toString(16).toUpperCase()}` : ""}
                        </span>
                        <span className="text-gray-500 shrink-0">{s.idioma ?? ""}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[10px] leading-relaxed text-gray-500">
                  {srtProbeLoading ? "Conectando ao transporte MPEG-TS para descobrir o nome do canal e os PIDs…" : srtProbe?.erro ?? "Sem metadados do canal neste momento."}
                </p>
              )}
            </div>
          )}

          {/* ARIB B24 CC Panel — visible for SRT/UDP sources */}
          {source && (source.tipo === "srt" || source.tipo === "udp") && (
            <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 flex flex-col gap-2" data-testid="panel-arib">
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                  <Radio className={`h-3 w-3 ${aribTemCC ? "text-orange-400" : "text-gray-600"}`}/>
                  CC ARIB B24 · PID 278
                </span>
                {aribTemCC && (
                  <Badge className="text-[10px] py-0 px-1.5 bg-orange-900 text-orange-300">ISDB-Tb</Badge>
                )}
              </div>

              {/* Status line */}
              {!aribLoading && aribDurMs !== null && (
                <div className={`text-[10px] font-mono flex items-center gap-1.5 ${aribTemCC ? "text-orange-400" : aribEstado === "erro" ? "text-red-400" : "text-gray-500"}`}>
                  {aribTemCC ? <CheckCircle2 className="h-3 w-3"/> : aribEstado === "erro" ? <AlertTriangle className="h-3 w-3"/> : <Radio className="h-3 w-3"/>}
                  {aribTemCC ? `${aribLinhas.length} linha(s) decodificada(s) · ${(aribDurMs/1000).toFixed(1)}s` : aribEstado === "erro" ? "Falha na captura" : `Sem CC detectado · ${(aribDurMs/1000).toFixed(1)}s analisados`}
                </div>
              )}

              {/* Decoded lines */}
              {aribTemCC && aribLinhas.length > 0 && (
                <div className="bg-black/40 rounded border border-[#1e2332] max-h-24 overflow-y-auto">
                  {aribLinhas.map((l, i) => (
                    <div key={i} className={`px-2 py-0.5 text-[11px] font-mono border-b border-[#1a1f2e] last:border-0 ${i === aribLineIdx % aribLinhas.length ? "text-orange-300 bg-orange-950/20" : "text-gray-400"}`}>
                      {l}
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {!aribLoading && aribErro && aribEstado === "erro" && (
                <p className="text-[10px] text-red-400 font-mono leading-relaxed">{aribErro}</p>
              )}

              {/* Loading */}
              {aribLoading && (
                <div className="flex items-center gap-2 text-[11px] text-orange-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                  Capturando CC ARIB — aguarde ~15s…
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  onClick={() => lerAribCC(15)}
                  disabled={aribLoading || srtProbeLoading || !sourceStreamUrl()}
                  className="flex items-center gap-1.5 text-[10px] font-semibold bg-orange-900 hover:bg-orange-800 disabled:opacity-40 text-orange-200 px-3 py-1 rounded transition-colors"
                  data-testid="btn-ler-arib">
                  {aribLoading ? <Loader2 className="h-3 w-3 animate-spin"/> : <Radio className="h-3 w-3"/>}
                  {aribLoading ? "Lendo…" : aribTemCC ? "Atualizar" : "Ler CC ARIB"}
                </button>
                {aribTemCC && (
                  <button
                     onClick={() => { setAribLinhas([]); setAribTemCC(false); setAribEstado(null); setAribErro(null); setAribDurMs(null); }}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    data-testid="btn-clear-arib">
                    Limpar
                  </button>
                )}
              </div>
              <p className="text-[9px] text-gray-500">CC em português · duas linhas · até 100 caracteres por linha</p>
            </div>
          )}

          {source && (source.tipo === "srt" || source.tipo === "udp") && (
            <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 flex flex-col gap-2" data-testid="panel-epg">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-teal-300">EPG automático · Programação da emissora</span>
                <span className="text-[10px] text-gray-500">{visibleEpgEvents.length} eventos</span>
              </div>
              <button onClick={lerEpg} disabled={epgLoading || aribLoading || srtProbeLoading || !sourceStreamUrl()}
                className="flex items-center justify-center gap-2 text-xs font-semibold bg-teal-900 hover:bg-teal-800 disabled:opacity-40 text-teal-100 px-3 py-2 rounded"
                data-testid="btn-show-epg">
                {epgLoading ? <Loader2 className="h-3 w-3 animate-spin"/> : <RefreshCw className="h-3 w-3"/>}
                {epgLoading ? "Lendo programação…" : epgEvents.length ? "Atualizar EPG" : "Mostrar EPG"}
              </button>
              {epgError && <p className="text-xs text-red-400">{epgError}</p>}
              {!epgEvents.length && !epgError && !epgLoading && <p className="text-xs text-gray-500">Aguardando EPG do sinal. A atualização é automática durante a reprodução SRT.</p>}
              {epgEvents.length > 0 && <div className="max-h-80 overflow-y-auto space-y-2">
                {visibleEpgEvents.map(event => <div key={`${event.serviceId}:${event.eventId}:${event.startTime}`} className={`border rounded p-2 ${event.startTime && Date.parse(event.startTime) <= epgNow ? "border-green-500 bg-green-950/40" : event === nextEpgEvent ? "border-yellow-500 bg-yellow-950/40" : "border-[#1e2332]"}`}>
                  <p className="text-xs font-semibold text-gray-200">{event.startTime && Date.now() >= Date.parse(event.startTime) && Date.now() < Date.parse(event.startTime) + event.durationSec * 1000 && <span className="text-green-400 mr-2">No ar</span>}{event === nextEpgEvent && <span className="text-yellow-400 mr-2">Próximo</span>}{event.title}</p>
                  <p className="text-[11px] text-teal-400">{event.startTime ? new Date(event.startTime).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Horário não informado"} · {fmtEpgDuration(event.durationSec)}</p>
                  {event.description && <p className="text-xs text-gray-400 mt-1">{event.description}</p>}
                </div>)}
              </div>}
            </div>
          )}

          {/* Status */}
          <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 flex flex-col gap-2" data-testid="panel-status">
            <span className="text-xs font-semibold text-gray-400 mb-0.5">Status do Sistema</span>
            <StatusRow label="Sinal de Vídeo" value={signalActive?"Ativo":"Inativo"} active={signalActive} onClick={()=>setSignalActive(v=>!v)} testId="btn-signal"/>
            <StatusRow label="Áudio" value={source?.tipo === "srt" && srtProbe?.ok && !srtAudioStream ? "Sem áudio" : audioActive ? "Recebendo" : "Silêncio"} active={audioActive} onClick={()=>{ if (!signalActive || (source?.tipo === "srt" && srtProbe?.ok)) return; setAudioActive(v=>{ if (!v) { setAudioLevels(Array(8).fill(-60)); setPeakLevels(Array(8).fill(-60)); } return !v; }); }} testId="btn-audio"/>
            <StatusRow label="Gravação" value={recording?"REC":"Parado"} active={recording} onClick={handleRecord} testId="btn-rec"/>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs text-gray-500">Closed Caption</span>
              <div className="flex items-center gap-2">
                <Switch checked={ccActive} onCheckedChange={setCcActive} className="scale-75" data-testid="switch-cc"/>
                <button className={`text-[10px] px-1.5 py-0.5 rounded ${ccShowOverlay?"text-teal-300":"text-gray-600"}`} onClick={()=>setCcShowOverlay(v=>!v)} data-testid="btn-cc-overlay">{ccShowOverlay?"Overlay":"Oculto"}</button>
              </div>
            </div>
            <div className="flex items-center justify-between py-0.5"><span className="text-xs text-gray-500">Formato CC</span><span className="text-xs font-mono text-gray-400">{config.ccFormat.split(" ")[0]}</span></div>
            <div className="flex items-center justify-between py-0.5"><span className="text-xs text-gray-500">Tipo de Entrada</span><span className={`text-xs font-mono font-bold ${source?.tipo==="sdi"?"text-teal-400":source?.tipo==="srt"?"text-blue-400":"text-purple-400"}`}>{source?.tipo?.toUpperCase()??"—"}</span></div>
            <div className="flex items-center justify-between py-0.5"><span className="text-xs text-gray-500">Notificações</span><span className={`text-xs font-mono ${hasNotif?"text-teal-400":"text-gray-600"}`}>{hasNotif?"Ativo":"Não config."}</span></div>
          </div>

          {/* Metrics */}
          <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 grid grid-cols-2 gap-2" data-testid="panel-metrics">
            <MetricTile label="Bitrate" value={`${metrics.bitrate}`} unit="Mbps" warn={metrics.bitrate>45}/>
            <MetricTile label="Dropped" value={`${metrics.dropped}`} unit="frames" warn={metrics.dropped>0} danger={metrics.dropped>5}/>
            <MetricTile label="Sinal" value={`${metrics.strength.toFixed(0)}`} unit="%" warn={metrics.strength<90} danger={metrics.strength<80}/>
            <MetricTile label="Codec" value={config.codec.split(" ")[0]} unit={config.codec.split(" ").slice(1).join(" ")}/>
          </div>

          {/* BTS quick ref */}
          <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 flex flex-col gap-1.5" data-testid="panel-bts-quick">
            <div className="flex items-center gap-1.5 mb-0.5"><RefreshCw className="h-3 w-3 text-gray-500"/><span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">BTS — ISDB-Tb</span></div>
            {[["PAT","0x0000","Associação de Programas"],["PMT","0x0100","Mapeamento de Streams"],["SDT","0x0011","Descrição do Serviço"],["NIT","0x0010","Info de Rede"],["EIT","0x0012","Tabela de Eventos"]].map(([t,pid,desc])=>(
              <div key={t} className="flex items-center justify-between"><div className="flex items-center gap-1.5"><span className="text-[10px] font-mono font-bold text-teal-500 w-7">{t}</span><span className="text-[9px] text-gray-500">{desc}</span></div><span className="text-[9px] font-mono text-gray-600">{pid}</span></div>
            ))}
          </div>

          {/* Source info card */}
          {source && (
            <div className="bg-[#0f1117] border border-[#1e2332] rounded-lg p-3 flex flex-col gap-1.5" data-testid="panel-source-info">
              <div className="flex items-center gap-1.5 mb-0.5">
                {source.tipo==="sdi"?<Cpu className="h-3.5 w-3.5 text-teal-400"/>:source.tipo==="srt"?<Wifi className="h-3.5 w-3.5 text-blue-400"/>:<Globe className="h-3.5 w-3.5 text-purple-400"/>}
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Entrada Ativa</span>
              </div>
              <p className="text-xs font-semibold text-gray-200 leading-tight">{source.nome}</p>
              {source.tipo==="sdi"&&source.sdi&&<><p className="text-[10px] text-gray-500 font-mono">{source.sdi.deviceName}</p><p className="text-[10px] text-gray-600">Porta {source.sdi.portIndex} · {source.sdi.videoFormat}</p><p className="text-[10px] text-gray-600">{source.sdi.audioChannels} ch · {source.sdi.linkMode} link</p></>}
              {source.tipo==="srt"&&source.srt&&<><p className="text-[10px] text-gray-500 font-mono">{source.srt.host}:{source.srt.port}</p><p className="text-[10px] text-gray-600">{source.srt.mode} · {source.srt.latencyMs}ms latência</p>{source.srt.passphrase&&<p className="text-[10px] text-gray-600">AES criptografado</p>}</>}
              {source.tipo==="udp"&&source.udp&&<><p className="text-[10px] text-gray-500 font-mono">{source.udp.address}:{source.udp.port}</p><p className="text-[10px] text-gray-600">{source.udp.protocol.toUpperCase()} · iface {source.udp.interface}</p><p className="text-[10px] text-gray-600">Buffer {(source.udp.bufferSize/1000).toFixed(0)} KB</p></>}
              <div className="flex items-center gap-3 mt-1">
                <button onClick={()=>setEntradasOpen(true)} className="text-[10px] text-teal-500 hover:text-teal-300 text-left transition-colors" data-testid="btn-edit-src">Editar entrada →</button>
                {source.tipo==="srt" && (
                  <button onClick={()=>setSrtTestOpen(true)} className="text-[10px] text-blue-400 hover:text-blue-200 transition-colors flex items-center gap-1" data-testid="btn-srt-test">
                    <Signal className="h-3 w-3"/>Testar SRT →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </MonitorWorkspace>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      <EntradasDialog open={entradasOpen} onOpenChange={setEntradasOpen} sources={sources} onSave={s=>{ saveSources(s); setSourceIdx(0); }}/>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} config={config} onChange={next=>{ setConfig(next); localStorage.setItem("dccp-recording-path", next.outputPath); }} sourceName={source?.nome??SISTEMA}/>
      <SrtTestDialog open={srtTestOpen} onOpenChange={setSrtTestOpen} source={source?.tipo==="srt"?source:null}/>
      <BtsReportDialog
        open={btsReportOpen}
        onOpenChange={setBtsReportOpen}
        checks={btsChecks}
        sourceName={source?.nome ?? "—"}
        selectedProgram={selectedProgramName}
        directoryName={btsDirectory?.name ?? null}
        onChooseDirectory={() => { void chooseBtsDirectory(); }}
        onGenerate={() => { void generateBtsReport(); }}
        saving={btsSaving}
        lastSaved={btsLastSaved}
      />
    </div>
  );
}








