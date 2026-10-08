import { pgTable, serial, text, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriaDescritorEnum = pgEnum("categoria_descritor", [
  "violencia", "sexualidade", "drogas", "linguagem", "medo", "outros"
]);

export const descritoresTable = pgTable("descritores", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  categoria: categoriaDescritorEnum("categoria").notNull(),
  descricao: text("descricao").notNull(),
  icone: text("icone"),
});

export const insertDescritorSchema = createInsertSchema(descritoresTable).omit({ id: true });
export type InsertDescritor = z.infer<typeof insertDescritorSchema>;
export type Descritor = typeof descritoresTable.$inferSelect;
