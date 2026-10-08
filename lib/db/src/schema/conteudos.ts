import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tipoConteudoEnum = pgEnum("tipo_conteudo", [
  "filme", "serie", "documentario", "animacao", "jogo", "publicidade", "outros"
]);

export const statusConteudoEnum = pgEnum("status_conteudo", [
  "aguardando", "em_analise", "classificado", "rejeitado"
]);

export const conteudosTable = pgTable("conteudos", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  titulo_original: text("titulo_original"),
  tipo: tipoConteudoEnum("tipo").notNull(),
  ano_producao: integer("ano_producao").notNull(),
  pais_origem: text("pais_origem").notNull(),
  distribuidora: text("distribuidora"),
  sinopse: text("sinopse"),
  duracao_min: integer("duracao_min"),
  status: statusConteudoEnum("status").notNull().default("aguardando"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
});

export const insertConteudoSchema = createInsertSchema(conteudosTable).omit({ id: true, criado_em: true, atualizado_em: true });
export type InsertConteudo = z.infer<typeof insertConteudoSchema>;
export type Conteudo = typeof conteudosTable.$inferSelect;
