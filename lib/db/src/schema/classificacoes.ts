import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usuariosTable } from "./usuarios";
import { conteudosTable } from "./conteudos";
import { solicitacoesTable } from "./solicitacoes";

export const faixaEtariaEnum = pgEnum("faixa_etaria", ["L", "10", "12", "14", "16", "18"]);

export const classificacoesTable = pgTable("classificacoes", {
  id: serial("id").primaryKey(),
  conteudo_id: integer("conteudo_id").notNull().references(() => conteudosTable.id),
  solicitacao_id: integer("solicitacao_id").notNull().references(() => solicitacoesTable.id),
  faixa_etaria: faixaEtariaEnum("faixa_etaria").notNull(),
  analista_id: integer("analista_id").notNull().references(() => usuariosTable.id),
  justificativa: text("justificativa"),
  observacoes_publicas: text("observacoes_publicas"),
  numero_certificado: text("numero_certificado").notNull(),
  validade_anos: integer("validade_anos"),
  emitida_em: timestamp("emitida_em").defaultNow().notNull(),
  atualizado_em: timestamp("atualizado_em").defaultNow().notNull(),
});

export const insertClassificacaoSchema = createInsertSchema(classificacoesTable).omit({ id: true, emitida_em: true, atualizado_em: true });
export type InsertClassificacao = z.infer<typeof insertClassificacaoSchema>;
export type Classificacao = typeof classificacoesTable.$inferSelect;
