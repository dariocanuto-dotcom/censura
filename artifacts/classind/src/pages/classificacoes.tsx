import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListClassificacoes,
  useUpdateClassificacao,
  getListClassificacoesQueryKey,
  useListDescritores,
} from "@workspace/api-client-react";
import type { Classificacao, ClassificacaoUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

const FAIXAS = ["L", "10", "12", "14", "16", "18"] as const;

export function AgeBadge({ age }: { age: string }) {
  const colors: Record<string, string> = {
    L: "bg-green-500 hover:bg-green-600",
    "10": "bg-blue-500 hover:bg-blue-600",
    "12": "bg-yellow-500 hover:bg-yellow-600",
    "14": "bg-orange-500 hover:bg-orange-600",
    "16": "bg-red-500 hover:bg-red-600",
    "18": "bg-slate-900 hover:bg-slate-900 text-white",
  };
  return <Badge className={`${colors[age] ?? "bg-gray-500"} text-white`}>{age}</Badge>;
}

function EditarClassificacaoDialog({
  open,
  onClose,
  classificacao,
}: {
  open: boolean;
  onClose: () => void;
  classificacao: Classificacao;
}) {
  const qc = useQueryClient();
  const { data: descritores } = useListDescritores();
  const [form, setForm] = useState<ClassificacaoUpdate>({
    faixa_etaria: classificacao.faixa_etaria,
    numero_certificado: classificacao.numero_certificado ?? "",
    justificativa: classificacao.justificativa ?? "",
  });
  const [selectedDescritores, setSelectedDescritores] = useState<number[]>(
    classificacao.descritores?.map(d => d.id) ?? []
  );

  const update = useUpdateClassificacao({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListClassificacoesQueryKey() }); toast.success("Classificação atualizada."); onClose(); },
      onError: () => toast.error("Erro ao atualizar classificação."),
    },
  });

  function toggleDescritor(id: number) {
    setSelectedDescritores(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate({
      id: classificacao.id,
      data: { ...form, numero_certificado: form.numero_certificado || undefined, justificativa: form.justificativa || undefined },
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Editar Classificação</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Conteúdo: <strong className="text-foreground">{classificacao.conteudo_titulo}</strong>
          </div>
          <div className="space-y-1.5">
            <Label>Faixa Etária</Label>
            <Select value={String(form.faixa_etaria)} onValueChange={v => setForm(f => ({ ...f, faixa_etaria: (v === "L" ? "L" : Number(v)) as typeof FAIXAS[number] extends "L" ? "L" : number }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FAIXAS.map(f => (
                  <SelectItem key={f} value={f}>
                    <span className="flex items-center gap-2"><AgeBadge age={f} />{f === "L" ? "— Livre" : `— ${f} anos`}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nº Certificado <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={form.numero_certificado ?? ""} onChange={e => setForm(f => ({ ...f, numero_certificado: e.target.value }))} placeholder="Ex: MJSP-2024-001234" />
          </div>
          {descritores && descritores.length > 0 && (
            <div className="space-y-1.5">
              <Label>Descritores</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-muted/30 max-h-40 overflow-y-auto">
                {descritores.map(d => (
                  <button key={d.id} type="button" onClick={() => toggleDescritor(d.id)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${selectedDescritores.includes(d.id) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/50"}`}>
                    {d.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Justificativa <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea value={form.justificativa ?? ""} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))} rows={3} placeholder="Motivação técnica da classificação" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={update.isPending}>{update.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Classificacoes() {
  const { data: classificacoes, isLoading } = useListClassificacoes();
  const [editando, setEditando] = useState<Classificacao | null>(null);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Classificações</h2>
          <p className="text-sm text-muted-foreground">Catálogo de classificações emitidas.</p>
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conteúdo</TableHead>
                  <TableHead>Faixa Etária</TableHead>
                  <TableHead>Certificado</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classificacoes?.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.conteudo_titulo}</TableCell>
                    <TableCell><AgeBadge age={String(c.faixa_etaria)} /></TableCell>
                    <TableCell>{c.numero_certificado ?? "N/A"}</TableCell>
                    <TableCell>{new Date(c.emitida_em).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/classificacoes/${c.id}`} className="text-primary hover:underline text-sm font-medium px-2 py-1">Detalhes</Link>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {classificacoes?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma classificação encontrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {editando && (
        <EditarClassificacaoDialog open={!!editando} onClose={() => setEditando(null)} classificacao={editando} />
      )}
    </Layout>
  );
}
