import { Router } from "express";
import { db } from "@workspace/db";
import { usuariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListUsuariosResponse,
  CreateUsuarioBody,
  GetUsuarioParams,
  UpdateUsuarioBody,
  UpdateUsuarioParams,
  DeleteUsuarioParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const usuarios = await db.select().from(usuariosTable).orderBy(usuariosTable.criado_em);
  const parsed = ListUsuariosResponse.parse(usuarios);
  res.json(parsed);
});

router.post("/", async (req, res) => {
  const body = CreateUsuarioBody.parse(req.body);
  const [created] = await db.insert(usuariosTable).values({
    nome: body.nome,
    email: body.email,
    perfil: body.perfil,
    senha_hash: body.senha ?? null,
    ativo: true,
  }).returning();
  res.status(201).json(created);
});

router.get("/:id", async (req, res) => {
  const { id } = GetUsuarioParams.parse({ id: Number(req.params.id) });
  const [usuario] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, id));
  if (!usuario) return res.status(404).json({ error: "Usuário não encontrado" });
  res.json(usuario);
});

router.patch("/:id", async (req, res) => {
  const { id } = UpdateUsuarioParams.parse({ id: Number(req.params.id) });
  const body = UpdateUsuarioBody.parse(req.body);
  const [updated] = await db.update(usuariosTable).set(body).where(eq(usuariosTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Usuário não encontrado" });
  res.json(updated);
});

router.delete("/:id", async (req, res) => {
  const { id } = DeleteUsuarioParams.parse({ id: Number(req.params.id) });
  try {
    await db.delete(usuariosTable).where(eq(usuariosTable.id, id));
    res.status(204).send();
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "23503") return res.status(409).json({ error: "Usuário possui registros associados e não pode ser excluído." });
    throw err;
  }
});

export default router;
