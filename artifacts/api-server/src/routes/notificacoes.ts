import { Router } from "express";
import { z } from "zod";

const router = Router();

const NotificacaoBody = z.object({
  tipo: z.enum(["video", "audio", "closed_caption", "loudness", "sinal", "teste"]),
  titulo: z.string(),
  mensagem: z.string(),
  fonte: z.string().optional(),
  severidade: z.enum(["info", "aviso", "critico"]).default("critico"),
  telegram: z.object({
    token: z.string(),
    chatId: z.string(),
  }).optional(),
  whatsapp: z.object({
    webhookUrl: z.string().url(),
    numero: z.string(),
    token: z.string().optional(),
    provider: z.enum(["z-api", "ultraMsg", "callmebot", "webhook"]).default("webhook"),
  }).optional(),
});

type SendResult = {
  canal: string;
  ok: boolean;
  erro?: string;
};

async function sendTelegram(token: string, chatId: string, text: string): Promise<SendResult> {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) throw new Error(data.description ?? "Telegram error");
    return { canal: "telegram", ok: true };
  } catch (e: unknown) {
    return { canal: "telegram", ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

async function sendWhatsApp(cfg: NonNullable<z.infer<typeof NotificacaoBody>["whatsapp"]>, text: string): Promise<SendResult> {
  try {
    let url = cfg.webhookUrl;
    let body: Record<string, string>;

    if (cfg.provider === "ultraMsg") {
      // UltraMsg API
      body = { token: cfg.token ?? "", to: cfg.numero, body: text };
    } else if (cfg.provider === "callmebot") {
      // CallMeBot API (GET with params)
      const params = new URLSearchParams({ phone: cfg.numero, text, apikey: cfg.token ?? "" });
      const res = await fetch(`https://api.callmebot.com/whatsapp.php?${params.toString()}`);
      if (!res.ok) throw new Error(`CallMeBot HTTP ${res.status}`);
      return { canal: "whatsapp", ok: true };
    } else if (cfg.provider === "z-api") {
      // Z-API format
      body = { phone: cfg.numero, message: text };
    } else {
      // Generic webhook
      body = { phone: cfg.numero, message: text, number: cfg.numero, text };
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.token && cfg.provider !== "callmebot") headers["Authorization"] = `Bearer ${cfg.token}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    return { canal: "whatsapp", ok: true };
  } catch (e: unknown) {
    return { canal: "whatsapp", ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

router.post("/enviar", async (req, res) => {
  const body = NotificacaoBody.parse(req.body);

  const emojiMap: Record<string, string> = {
    video: "📺",
    audio: "🔇",
    closed_caption: "💬",
    loudness: "📈",
    sinal: "📡",
    teste: "🧪",
  };

  const sevMap: Record<string, string> = {
    critico: "🔴 CRÍTICO",
    aviso: "🟡 AVISO",
    info: "🟢 INFO",
  };

  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const emoji = emojiMap[body.tipo] ?? "⚠️";
  const sev = sevMap[body.severidade] ?? "⚠️";

  const text = [
    `${emoji} <b>ClassInd — Alerta de Broadcast</b>`,
    `${sev}`,
    ``,
    `<b>Tipo:</b> ${body.titulo}`,
    `<b>Mensagem:</b> ${body.mensagem}`,
    ...(body.fonte ? [`<b>Fonte:</b> ${body.fonte}`] : []),
    `<b>Horário:</b> ${now}`,
    ``,
    `Sistema: DC CENSURA PRO - Engenheiro Dário Canuto`,
  ].join("\n");

  const results: SendResult[] = [];

  const promises: Promise<SendResult>[] = [];
  if (body.telegram) promises.push(sendTelegram(body.telegram.token, body.telegram.chatId, text));
  if (body.whatsapp) promises.push(sendWhatsApp(body.whatsapp, text.replace(/<[^>]+>/g, "")));

  const settled = await Promise.allSettled(promises);
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(s.value);
    else results.push({ canal: "desconhecido", ok: false, erro: String(s.reason) });
  }

  const allOk = results.every(r => r.ok);
  res.status(allOk ? 200 : 207).json({
    enviado: allOk,
    resultados: results,
    mensagem: text.replace(/<[^>]+>/g, ""),
  });
});

// Test connectivity without sending
router.post("/testar", async (req, res) => {
  req.body.tipo = "teste";
  req.body.titulo = "Teste de Conectividade";
  req.body.mensagem = "Notificação de teste do sistema ClassInd. Configuração verificada com sucesso.";
  req.body.severidade = "info";
  return router.handle(req, res, () => {});
});

export default router;
