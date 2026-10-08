import { Router } from "express";
import { db } from "@workspace/db";
import { conteudosTable } from "@workspace/db";
import { eq, ilike, and } from "drizzle-orm";
import {
  ListConteudosQueryParams,
  ListConteudosResponse,
  CreateConteudoBody,
  GetConteudoParams,
  UpdateConteudoBody,
  UpdateConteudoParams,
  DeleteConteudoParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const query = ListConteudosQueryParams.parse(req.query);
  const conditions = [];
  if (query.tipo) conditions.push(eq(conteudosTable.tipo, query.tipo as any));
  if (query.status) conditions.push(eq(conteudosTable.status, query.status as any));
  if (query.busca) conditions.push(ilike(conteudosTable.titulo, `%${query.busca}%`));

  const conteudos = conditions.length > 0
    ? await db.select().from(conteudosTable).where(and(...conditions)).orderBy(conteudosTable.criado_em)
    : await db.select().from(conteudosTable).orderBy(conteudosTable.criado_em);

  res.json(ListConteudosResponse.parse(conteudos));
});

router.post("/", async (req, res) => {
  const body = CreateConteudoBody.parse(req.body);
  const [created] = await db.insert(conteudosTable).values({
    titulo: body.titulo,
    titulo_original: body.titulo_original ?? null,
    tipo: body.tipo as any,
    ano_producao: body.ano_producao,
    pais_origem: body.pais_origem,
    distribuidora: body.distribuidora ?? null,
    sinopse: body.sinopse ?? null,
    duracao_min: body.duracao_min ?? null,
    status: "aguardando",
  }).returning();
  res.status(201).json(created);
});

router.get("/:id", async (req, res) => {
  const { id } = GetConteudoParams.parse({ id: Number(req.params.id) });
  const [conteudo] = await db.select().from(conteudosTable).where(eq(conteudosTable.id, id));
  if (!conteudo) return res.status(404).json({ error: "Conteúdo não encontrado" });
  res.json(conteudo);
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateConteudoParams.parse({ id: Number(req.params.id) });
  const body = UpdateConteudoBody.parse(req.body);
  const updates: Record<string, unknown> = { ...body, atualizado_em: new Date() };
  const [updated] = await db.update(conteudosTable).set(updates).where(eq(conteudosTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Conteúdo não encontrado" });
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteConteudoParams.parse({ id: Number(req.params.id) });
  try {
    await db.delete(conteudosTable).where(eq(conteudosTable.id, id));
    res.status(204).send();
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23503") return res.status(409).json({ error: "Conteúdo possui solicitações ou classificações associadas e não pode ser excluído." });
    throw err;
  }
});

export default router;
