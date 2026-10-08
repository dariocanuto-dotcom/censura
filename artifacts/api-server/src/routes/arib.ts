import { Router } from "express";
import { spawn } from "node:child_process";

const router = Router();

interface AribResult {
  ok: boolean;
  temCC: boolean;
  linhas: string[];
  codec: string | null;
  estado: "capturado" | "sem_cc" | "erro";
  erro: string | null;
  duracaoMs: number;
  url: string;
}

function aribStreamMap(programId?: number, streamIndex?: number, captionPid?: number): string {
  // arib_caption is exposed by FFmpeg as a subtitle stream. The previous
  // metadata selector (0:m:codec:arib_caption) never matched the codec and
  // silently returned an empty output.
  if (captionPid !== undefined && Number.isInteger(captionPid) && captionPid >= 0 && captionPid <= 0x1fff) {
    return `0:i:${captionPid}?`;
  }
  if (streamIndex !== undefined && Number.isInteger(streamIndex) && streamIndex >= 0) {
    return `0:${streamIndex}?`;
  }
  return programId !== undefined && Number.isInteger(programId)
    ? `0:p:${programId}:s?`
    : "0:s?";
}

// Strip ASS override tags and convert escapes to plain text
function assTextToPlain(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, "")   // {override blocks}
    .replace(/\\N/g, " ")          // hard newline
    .replace(/\\n/g, " ")          // soft newline
    .replace(/\\h/g, "\u00a0")     // hard space
    .replace(/  +/g, " ")
    .trim();
}

// Parse ASS subtitle format and extract unique dialogue lines
export function parseAssDialogue(raw: string, deduplicate = true): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.startsWith("Dialogue:")) continue;
    // ASS Dialogue fields: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    const commaIdx = [0,1,2,3,4,5,6,7,8].reduce((acc, _) => {
      const next = raw.indexOf(",", acc + 1); return next;
    }, line.indexOf(":"));
    // Simpler: split on comma, text is everything from field 9 onward
    const parts = line.split(",");
    if (parts.length < 10) continue;
    const text = assTextToPlain(parts.slice(9).join(","));
    if (text && (!deduplicate || !seen.has(text))) {
      seen.add(text);
      lines.push(text);
    }
  }
  return lines;
}

// POST /api/arib/captions — extrai CC ARIB B24 de um stream via ffmpeg/libaribcaption
router.post("/captions", async (req, res) => {
  const { url, durationSec = 15, programId, captionStreamIndex, captionPid } = req.body as {
    url: string; durationSec?: number; programId?: number; captionStreamIndex?: number; captionPid?: number;
  };

  if (!url) {
    res.status(400).json({ ok: false, erro: "url é obrigatória", temCC: false, linhas: [], codec: null, estado: "erro", duracaoMs: 0, url: "" });
    return;
  }

  const dur = Math.min(Math.max(Number(durationSec) || 15, 5), 60);
  const captureTimeoutSec = dur + 5;
  const t0 = Date.now();

  const result = await new Promise<AribResult>(resolve => {
    // First detect which subtitle stream / codec exists
    // Then decode ARIB B24 using libaribcaption
    const args = [
      "-v", "info",
      "-timeout", "10000000",          // connection timeout in µs
      "-c:s", "libaribcaption",        // decoder de entrada ARIB B24
      "-sub_type", "ass",              // mantém as caixas/linhas como ASS para o muxer
      "-caption_encoding", "latin",    // SBTVD / ISDB-Tb do Brasil
      "-t", String(dur),                // limita a leitura do transporte
      "-i", url,
      "-map", aribStreamMap(programId, captionStreamIndex, captionPid), // aceita PID MPEG-TS ou índice exato detectado pelo ffprobe
      "-c:s", "ass",                   // libaribcaption é decoder; ASS é o formato de saída
      "-f", "ass",                     // output as ASS subtitles
      "-y",
      "pipe:1",                        // write to stdout
    ];

    const proc = spawn("ffmpeg", args, { timeout: captureTimeoutSec * 1000 });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr = `${stderr}${d.toString()}`.slice(-20000); });

    const fail = (erro: string) => resolve({
      ok: false, temCC: false, linhas: [], codec: null, estado: "erro", erro, duracaoMs: Date.now()-t0, url,
    });
    const noCc = (hasAribStream: boolean) => resolve({
      ok: true,
      temCC: false,
      linhas: [],
      codec: hasAribStream ? "ARIB STD-B24 (libaribcaption)" : null,
      estado: "sem_cc" as const,
      erro: null,
      duracaoMs: Date.now()-t0,
      url,
    });
    const finishOutput = () => {
      const linhas = parseAssDialogue(stdout);
      const temCC = linhas.length > 0;
      resolve({
        ok: true,
        temCC,
        linhas,
        codec: "ARIB STD-B24 (libaribcaption)",
        estado: temCC ? "capturado" as const : "sem_cc" as const,
        erro: null,
        duracaoMs: Date.now()-t0,
        url,
      });
    };

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      if (stdout.trim()) {
        finishOutput();
      } else if (stderr.toLowerCase().includes("arib_caption")) {
        noCc(true);
      } else {
        fail(`Timeout após ${captureTimeoutSec}s — conexão SRT não respondeu.`);
      }
    }, captureTimeoutSec * 1000);

    proc.on("close", code => {
      clearTimeout(timer);

      // Even non-zero exit can yield valid subtitle data (ffmpeg exits non-0 at stream end)
      if (!stdout.trim()) {
        const errLower = stderr.toLowerCase();
        const hasAribStream = errLower.includes("arib_caption");
        const noCaptionStream = errLower.includes("no such stream")
          || errLower.includes("stream specifier")
          || errLower.includes("invalid stream")
          || errLower.includes("does not contain any stream");
        if (errLower.includes("unknown decoder") || errLower.includes("decoder not found") || errLower.includes("unrecognized option")) {
          return fail(stderr.trim().slice(-1500));
        }
        const connectedWithoutCaption = code === 0 && (hasAribStream || noCaptionStream);
        if (connectedWithoutCaption) {
          return noCc(hasAribStream);
        }
        if (errLower.includes("connection") || errLower.includes("timeout")) {
          return fail("Não foi possível conectar ao stream dentro do prazo.");
        }
        if (code === 234) {
          return fail("A emissora recusou a conexão ARIB (código 234). O SRT pode estar ocupado por outra sessão de vídeo.");
        }
        return fail(`Falha ao decodificar ARIB B24 (ffmpeg código ${code}): ${stderr.trim().slice(-1500)}`);
      }

      finishOutput();
    });

    proc.on("error", e => { clearTimeout(timer); fail(`Falha ao invocar ffmpeg: ${e.message}`); });
  });

  res.status(result.ok ? 200 : 502).json(result);
});

// GET /api/arib/status — verifica se libaribcaption está disponível
router.get("/status", (_req, res) => {
  const proc = spawn("ffmpeg", ["-codecs"], { timeout: 5000 });
  let out = "";
  proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
  proc.stderr.on("data", (d: Buffer) => { out += d.toString(); });
  proc.on("close", () => {
    const hasLibarib = out.includes("libaribcaption") || out.includes("libaribb24");
    const hasArib = out.includes("arib_caption");
    res.json({
      disponivel: hasLibarib,
      libaribcaption: out.includes("libaribcaption"),
      libaribb24: out.includes("libaribb24"),
      arib_caption_codec: hasArib,
    });
  });
  proc.on("error", () => res.json({ disponivel: false }));
});

export default router;


