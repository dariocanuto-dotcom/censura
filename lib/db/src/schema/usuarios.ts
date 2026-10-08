import { pgTable, serial, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const perfilEnum = pgEnum("perfil", ["administrador", "supervisor", "analista", "solicitante"]);

export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senha_hash: text("senha_hash"),
  perfil: perfilEnum("perfil").notNull().default("solicitante"),
  ativo: boolean("ativo").notNull().default(true),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
});

export const insertUsuarioSchema = createInsertSchema(usuariosTable).omit({ id: true, criado_em: true });
export type InsertUsuario = z.infer<typeof insertUsuarioSchema>;
export type Usuario = typeof usuariosTable.$inferSelect;
