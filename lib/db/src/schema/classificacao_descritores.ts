import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { classificacoesTable } from "./classificacoes";
import { descritoresTable } from "./descritores";

export const classificacaoDescritoresTable = pgTable("classificacao_descritores", {
  classificacao_id: integer("classificacao_id").notNull().references(() => classificacoesTable.id, { onDelete: "cascade" }),
  descritor_id: integer("descritor_id").notNull().references(() => descritoresTable.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.classificacao_id, table.descritor_id] })
]);
