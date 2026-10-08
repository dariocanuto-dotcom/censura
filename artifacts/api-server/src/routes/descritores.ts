import { Router } from "express";
import { db } from "@workspace/db";
import { descritoresTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListDescritoresResponse,
  CreateDescritorBody,
  UpdateDescritorBody,
  UpdateDescritorParams,
  DeleteDescritorParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (_req, res) => {
  const descritores = await db.select().from(descritoresTable).orderBy(descritoresTable.categoria);
  res.json(ListDescritoresResponse.parse(descritores));
});

router.post("/", async (req, res) => {
  const body = CreateDescritorBody.parse(req.body);
  const [created] = await db.insert(descritoresTable).values({
    nome: body.nome,
    categoria: body.categoria as any,
    descricao: body.descricao,
    icone: body.icone ?? null,
  }).returning();
  res.status(201).json(created);
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateDescritorParams.parse({ id: Number(req.params.id) });
  const body = UpdateDescritorBody.parse(req.body);
  const [updated] = await db.update(descritoresTable).set(body).where(eq(descritoresTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Descritor não encontrado" });
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteDescritorParams.parse({ id: Number(req.params.id) });
  try {
    await db.delete(descritoresTable).where(eq(descritoresTable.id, id));
    res.status(204).send();
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23503") return res.status(409).json({ error: "Descritor está associado a classificações e não pode ser excluído." });
    throw err;
  }
});

export default router;
