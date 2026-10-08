import { Router } from "express";
import { db } from "@workspace/db";
import {
  solicitacoesTable,
  classificacoesTable,
  classificacaoDescritoresTable,
  descritoresTable,
  conteudosTable,
  usuariosTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import {
  ListSolicitacoesQueryParams,
  CreateSolicitacaoBody,
  GetSolicitacaoParams,
  UpdateSolicitacaoBody,
  UpdateSolicitacaoParams,
  AprovarSolicitacaoParams,
  AprovarSolicitacaoBody,
  RejeitarSolicitacaoParams,
  RejeitarSolicitacaoBody,
} from "@workspace/api-zod";

const router = Router();

async function enrichSolicitacao(s: typeof solicitacoesTable.$inferSelect) {
  const [conteudo] = s.conteudo_id
    ? await db.select({ titulo: conteudosTable.titulo, tipo: conteudosTable.tipo })
        .from(conteudosTable).where(eq(conteudosTable.id, s.conteudo_id))
    : [null];
  const [solicitante] = s.solicitante_id
    ? await db.select({ nome: usuariosTable.nome }).from(usuariosTable).where(eq(usuariosTable.id, s.solicitante_id))
    : [null];
  const [analista] = s.analista_id
    ? await db.select({ nome: usuariosTable.nome }).from(usuariosTable).where(eq(usuariosTable.id, s.analista_id))
    : [null];
  return {
    ...s,
    conteudo_titulo: conteudo?.titulo ?? null,
    conteudo_tipo: conteudo?.tipo ?? null,
    solicitante_nome: solicitante?.nome ?? null,
    analista_nome: analista?.nome ?? null,
  };
}

router.get("/", async (req, res) => {
  const query = ListSolicitacoesQueryParams.parse(req.query);
  const conditions = [];
  if (query.status) conditions.push(eq(solicitacoesTable.status, query.status as any));
  if (query.analista_id) conditions.push(eq(solicitacoesTable.analista_id, Number(query.analista_id)));

  const rows = conditions.length > 0
    ? await db.select().from(solicitacoesTable).where(and(...conditions)).orderBy(desc(solicitacoesTable.criado_em))
    : await db.select().from(solicitacoesTable).orderBy(desc(solicitacoesTable.criado_em));

  const enriched = await Promise.all(rows.map(enrichSolicitacao));
  res.json(enriched);
});

router.post("/", async (req, res) => {
  const body = CreateSolicitacaoBody.parse(req.body);
  const [created] = await db.insert(solicitacoesTable).values({
    conteudo_id: body.conteudo_id,
    solicitante_id: body.solicitante_id,
    observacoes: body.observacoes ?? null,
    prazo: body.prazo ?? null,
    status: "pendente",
  }).returning();

  await db.update(conteudosTable).set({ status: "em_analise", atualizado_em: new Date() })
    .where(eq(conteudosTable.id, body.conteudo_id));

  res.status(201).json(await enrichSolicitacao(created));
});

router.get("/:id", async (req, res) => {
  const { id } = GetSolicitacaoParams.parse({ id: Number(req.params.id) });
  const [sol] = await db.select().from(solicitacoesTable).where(eq(solicitacoesTable.id, id));
  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada" });
  res.json(await enrichSolicitacao(sol));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateSolicitacaoParams.parse({ id: Number(req.params.id) });
  const body = UpdateSolicitacaoBody.parse(req.body);
  const updates: Record<string, unknown> = { ...body, atualizado_em: new Date() };
  const [updated] = await db.update(solicitacoesTable).set(updates).where(eq(solicitacoesTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Solicitação não encontrada" });
  res.json(await enrichSolicitacao(updated));
});

router.post("/:id/aprovar", async (req, res) => {
  const { id } = AprovarSolicitacaoParams.parse({ id: Number(req.params.id) });
  const body = AprovarSolicitacaoBody.parse(req.body);

  const [sol] = await db.select().from(solicitacoesTable).where(eq(solicitacoesTable.id, id));
  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada" });

  const numero_certificado = `MJ-${Date.now()}-${sol.conteudo_id}`;

  const [classificacao] = await db.insert(classificacoesTable).values({
    conteudo_id: sol.conteudo_id,
    solicitacao_id: id,
    faixa_etaria: body.faixa_etaria as any,
    analista_id: body.analista_id,
    justificativa: body.justificativa ?? null,
    observacoes_publicas: body.observacoes_publicas ?? null,
    numero_certificado,
    validade_anos: body.validade_anos ?? null,
  }).returning();

  if (body.descritores_ids?.length) {
    await db.insert(classificacaoDescritoresTable).values(
      body.descritores_ids.map((d) => ({ classificacao_id: classificacao.id, descritor_id: d }))
    );
  }

  await db.update(solicitacoesTable).set({ status: "aprovada", atualizado_em: new Date() }).where(eq(solicitacoesTable.id, id));
  await db.update(conteudosTable).set({ status: "classificado", atualizado_em: new Date() }).where(eq(conteudosTable.id, sol.conteudo_id));

  const descritores = body.descritores_ids?.length
    ? await db.select().from(descritoresTable).where(
        eq(descritoresTable.id, body.descritores_ids[0])
      )
    : [];

  const allDescritores = body.descritores_ids?.length
    ? await Promise.all(body.descritores_ids.map(async (did) => {
        const [d] = await db.select().from(descritoresTable).where(eq(descritoresTable.id, did));
        return d;
      }))
    : [];

  const [conteudo] = await db.select({ titulo: conteudosTable.titulo, tipo: conteudosTable.tipo })
    .from(conteudosTable).where(eq(conteudosTable.id, sol.conteudo_id));
  const [analista] = await db.select({ nome: usuariosTable.nome }).from(usuariosTable).where(eq(usuariosTable.id, body.analista_id));

  res.json({
    ...classificacao,
    conteudo_titulo: conteudo?.titulo ?? null,
    conteudo_tipo: conteudo?.tipo ?? null,
    analista_nome: analista?.nome ?? null,
    descritores: allDescritores.filter(Boolean),
  });
});

router.post("/:id/rejeitar", async (req, res) => {
  const { id } = RejeitarSolicitacaoParams.parse({ id: Number(req.params.id) });
  const body = RejeitarSolicitacaoBody.parse(req.body);

  const [sol] = await db.select().from(solicitacoesTable).where(eq(solicitacoesTable.id, id));
  if (!sol) return res.status(404).json({ error: "Solicitação não encontrada" });

  const [updated] = await db.update(solicitacoesTable)
    .set({ status: "rejeitada", observacoes: body.motivo, atualizado_em: new Date() })
    .where(eq(solicitacoesTable.id, id)).returning();

  await db.update(conteudosTable).set({ status: "rejeitado", atualizado_em: new Date() }).where(eq(conteudosTable.id, sol.conteudo_id));

  res.json(await enrichSolicitacao(updated));
});

export default router;
