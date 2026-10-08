import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListSolicitacoes,
  useCreateSolicitacao,
  useUpdateSolicitacao,
  getListSolicitacoesQueryKey,
  useListConteudos,
  useListUsuarios,
} from "@workspace/api-client-react";
import type { Solicitacao, SolicitacaoInput, SolicitacaoUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTS = ["pendente", "em_analise", "aprovada", "rejeitada"] as const;

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "aprovada") return "default";
  if (status === "rejeitada") return "destructive";
  if (status === "em_analise") return "outline";
  return "secondary";
}

function CriarSolicitacaoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: conteudos } = useListConteudos();
  const { data: usuarios } = useListUsuarios();

  const [form, setForm] = useState<SolicitacaoInput>({ conteudo_id: 0, solicitante_id: 0, observacoes: "", prazo: "" });

  const create = useCreateSolicitacao({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListSolicitacoesQueryKey() }); toast.success("Solicitação criada."); onClose(); },
      onError: () => toast.error("Erro ao criar solicitação."),
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.conteudo_id || !form.solicitante_id) { toast.error("Selecione o conteúdo e o solicitante."); return; }
    create.mutate({ data: { conteudo_id: form.conteudo_id, solicitante_id: form.solicitante_id, ...(form.observacoes ? { observacoes: form.observacoes } : {}), ...(form.prazo ? { prazo: form.prazo } : {}) } });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova Solicitação</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Conteúdo</Label>
            <Select value={String(form.conteudo_id || "")} onValueChange={v => setForm(f => ({ ...f, conteudo_id: Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o conteúdo" /></SelectTrigger>
              <SelectContent>
                {conteudos?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.titulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Solicitante</Label>
            <Select value={String(form.solicitante_id || "")} onValueChange={v => setForm(f => ({ ...f, solicitante_id: Number(v) }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o solicitante" /></SelectTrigger>
              <SelectContent>
                {usuarios?.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input type="date" value={form.prazo ?? ""} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Observações <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea value={form.observacoes ?? ""} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando…" : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditarSolicitacaoDialog({
  open,
  onClose,
  solicitacao,
}: {
  open: boolean;
  onClose: () => void;
  solicitacao: Solicitacao;
}) {
  const qc = useQueryClient();
  const { data: usuarios } = useListUsuarios();
  const [form, setForm] = useState<SolicitacaoUpdate>({
    status: solicitacao.status,
    observacoes: solicitacao.observacoes ?? "",
    prazo: solicitacao.prazo ? solicitacao.prazo.slice(0, 10) : "",
    analista_id: solicitacao.analista_id ?? undefined,
  });

  const update = useUpdateSolicitacao({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListSolicitacoesQueryKey() }); toast.success("Solicitação atualizada."); onClose(); },
      onError: () => toast.error("Erro ao atualizar solicitação."),
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    update.mutate({ id: solicitacao.id, data: { ...form, observacoes: form.observacoes || undefined, prazo: form.prazo || undefined } });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar Solicitação</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Conteúdo: <strong className="text-foreground">{solicitacao.conteudo_titulo}</strong>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status ?? solicitacao.status} onValueChange={v => setForm(f => ({ ...f, status: v as typeof STATUS_OPTS[number] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Analista Responsável <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Select value={String(form.analista_id ?? "")} onValueChange={v => setForm(f => ({ ...f, analista_id: v ? Number(v) : undefined }))}>
              <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Nenhum —</SelectItem>
                {usuarios?.filter(u => u.perfil === "analista" || u.perfil === "supervisor").map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input type="date" value={form.prazo ?? ""} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.observacoes ?? ""} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} />
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

export default function Solicitacoes() {
  const { data: solicitacoes, isLoading } = useListSolicitacoes();

  const [criarOpen, setCriarOpen] = useState(false);
  const [editando, setEditando] = useState<Solicitacao | null>(null);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Solicitações</h2>
            <p className="text-sm text-muted-foreground">Fila de solicitações de classificação indicativa.</p>
          </div>
          <Button onClick={() => setCriarOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />Nova Solicitação
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conteúdo</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitacoes?.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.conteudo_titulo}</TableCell>
                    <TableCell>{s.solicitante_nome}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(s.status)} className="capitalize">{s.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>{new Date(s.criado_em).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/solicitacoes/${s.id}`} className="text-primary hover:underline text-sm font-medium px-2 py-1">Analisar</Link>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditando(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {solicitacoes?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhuma solicitação encontrada.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CriarSolicitacaoDialog open={criarOpen} onClose={() => setCriarOpen(false)} />
      {editando && (
        <EditarSolicitacaoDialog open={!!editando} onClose={() => setEditando(null)} solicitacao={editando} />
      )}
    </Layout>
  );
}
