import { pgTable, serial, integer, text, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usuariosTable } from "./usuarios";
import { conteudosTable } from "./conteudos";

export const statusSolicitacaoEnum = pgEnum("status_solicitacao", [
  "pendente", "em_analise", "aprovada", "rejeitada"
]);

export const solicitacoesTable = pgTable("solicitacoes", {
  id: serial("id").primaryKey(),
  conteudo_id: integer("conteudo_id").notNull().references(() => conteudosTable.id),
  solicitante_id: integer("solicitante_id").notNull().references(() => usuariosTable.id),
  analista_id: integer("analista_id").references(() => usuariosTable.id),
  status: statusSolicitacaoEnum("status").notNull().default("pendente"),
  observacoes: text("observacoes"),
  prazo: date("prazo"),
  criado_em: timestamp("criado_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
});

export const insertSolicitacaoSchema = createInsertSchema(solicitacoesTable).omit({ id: true, status: true, criado_em: true, atualizado_em: true });
export type InsertSolicitacao = z.infer<typeof insertSolicitacaoSchema>;
export type Solicitacao = typeof solicitacoesTable.$inferSelect;
