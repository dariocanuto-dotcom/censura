import { Router } from "express";
import { db } from "@workspace/db";
import {
  classificacoesTable,
  classificacaoDescritoresTable,
  descritoresTable,
  conteudosTable,
  usuariosTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  ListClassificacoesQueryParams,
  GetClassificacaoParams,
  UpdateClassificacaoBody,
  UpdateClassificacaoParams,
} from "@workspace/api-zod";

const router = Router();

async function enrichClassificacao(c: typeof classificacoesTable.$inferSelect) {
  const [conteudo] = await db.select({ titulo: conteudosTable.titulo, tipo: conteudosTable.tipo })
    .from(conteudosTable).where(eq(conteudosTable.id, c.conteudo_id));
  const [analista] = await db.select({ nome: usuariosTable.nome })
    .from(usuariosTable).where(eq(usuariosTable.id, c.analista_id));

  const cdRows = await db.select({ descritor_id: classificacaoDescritoresTable.descritor_id })
    .from(classificacaoDescritoresTable).where(eq(classificacaoDescritoresTable.classificacao_id, c.id));
  const ids = cdRows.map((r) => r.descritor_id);
  const descritores = ids.length
    ? await db.select().from(descritoresTable).where(inArray(descritoresTable.id, ids))
    : [];

  return {
    ...c,
    conteudo_titulo: conteudo?.titulo ?? null,
    conteudo_tipo: conteudo?.tipo ?? null,
    analista_nome: analista?.nome ?? null,
    descritores,
  };
}

router.get("/", async (req, res) => {
  const query = ListClassificacoesQueryParams.parse(req.query);
  const conditions = [];
  if (query.faixa) conditions.push(eq(classificacoesTable.faixa_etaria, query.faixa as any));

  const rows = conditions.length > 0
    ? await db.select().from(classificacoesTable).where(and(...conditions)).orderBy(classificacoesTable.emitida_em)
    : await db.select().from(classificacoesTable).orderBy(classificacoesTable.emitida_em);

  const enriched = await Promise.all(rows.map(enrichClassificacao));
  res.json(enriched);
});

router.get("/:id", async (req, res) => {
  const { id } = GetClassificacaoParams.parse({ id: Number(req.params.id) });
  const [c] = await db.select().from(classificacoesTable).where(eq(classificacoesTable.id, id));
  if (!c) return res.status(404).json({ error: "Classificação não encontrada" });
  res.json(await enrichClassificacao(c));
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateClassificacaoParams.parse({ id: Number(req.params.id) });
  const body = UpdateClassificacaoBody.parse(req.body);
  const { descritores_ids, ...rest } = body;

  const [updated] = await db.update(classificacoesTable)
    .set({ ...rest, atualizado_em: new Date() } as any)
    .where(eq(classificacoesTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Classificação não encontrada" });

  if (descritores_ids) {
    await db.delete(classificacaoDescritoresTable).where(eq(classificacaoDescritoresTable.classificacao_id, id));
    if (descritores_ids.length) {
      await db.insert(classificacaoDescritoresTable).values(
        descritores_ids.map((d) => ({ classificacao_id: id, descritor_id: d }))
      );
    }
  }

  res.json(await enrichClassificacao(updated));
});

export default router;
