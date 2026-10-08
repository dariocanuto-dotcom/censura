import { Router } from "express";
import { db } from "@workspace/db";
import {
  solicitacoesTable,
  classificacoesTable,
  classificacaoDescritoresTable,
  descritoresTable,
  conteudosTable,
} from "@workspace/db";
import { count, eq, gte, sql } from "drizzle-orm";

const router = Router();

router.get("/resumo", async (_req, res) => {
  const [{ total_conteudos }] = await db.select({ total_conteudos: count() }).from(conteudosTable);
  const [{ total_solicitacoes }] = await db.select({ total_solicitacoes: count() }).from(solicitacoesTable);
  const [{ solicitacoes_pendentes }] = await db.select({ solicitacoes_pendentes: count() })
    .from(solicitacoesTable).where(eq(solicitacoesTable.status, "pendente"));
  const [{ solicitacoes_em_analise }] = await db.select({ solicitacoes_em_analise: count() })
    .from(solicitacoesTable).where(eq(solicitacoesTable.status, "em_analise"));
  const [{ total_classificacoes }] = await db.select({ total_classificacoes: count() }).from(classificacoesTable);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [{ classificacoes_mes }] = await db.select({ classificacoes_mes: count() })
    .from(classificacoesTable).where(gte(classificacoesTable.emitida_em, startOfMonth));

  res.json({
    total_conteudos,
    total_solicitacoes,
    solicitacoes_pendentes,
    solicitacoes_em_analise,
    total_classificacoes,
    classificacoes_mes,
    tempo_medio_analise_dias: null,
  });
});

router.get("/distribuicao-faixas", async (_req, res) => {
  const rows = await db
    .select({
      faixa: classificacoesTable.faixa_etaria,
      total: count(),
    })
    .from(classificacoesTable)
    .groupBy(classificacoesTable.faixa_etaria);

  res.json(rows);
});

router.get("/distribuicao-tipos", async (_req, res) => {
  const rows = await db
    .select({
      tipo: conteudosTable.tipo,
      total: count(),
    })
    .from(conteudosTable)
    .groupBy(conteudosTable.tipo);

  res.json(rows);
});

router.get("/solicitacoes-recentes", async (_req, res) => {
  const rows = await db
    .select()
    .from(solicitacoesTable)
    .orderBy(sql`${solicitacoesTable.criado_em} DESC`)
    .limit(10);

  const enriched = await Promise.all(rows.map(async (s) => {
    const [conteudo] = await db.select({ titulo: conteudosTable.titulo, tipo: conteudosTable.tipo })
      .from(conteudosTable).where(eq(conteudosTable.id, s.conteudo_id));
    return {
      ...s,
      conteudo_titulo: conteudo?.titulo ?? null,
      conteudo_tipo: conteudo?.tipo ?? null,
      solicitante_nome: null,
      analista_nome: null,
    };
  }));

  res.json(enriched);
});

router.get("/descritores-frequentes", async (_req, res) => {
  const rows = await db
    .select({
      descritor_id: descritoresTable.id,
      nome: descritoresTable.nome,
      categoria: descritoresTable.categoria,
      total: count(classificacaoDescritoresTable.classificacao_id),
    })
    .from(descritoresTable)
    .leftJoin(classificacaoDescritoresTable, eq(classificacaoDescritoresTable.descritor_id, descritoresTable.id))
    .groupBy(descritoresTable.id, descritoresTable.nome, descritoresTable.categoria)
    .orderBy(sql`count(${classificacaoDescritoresTable.classificacao_id}) DESC`)
    .limit(8);

  res.json(rows);
});

export default router;
