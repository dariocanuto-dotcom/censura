import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListConteudos,
  useCreateConteudo,
  useUpdateConteudo,
  useDeleteConteudo,
  getListConteudosQueryKey,
} from "@workspace/api-client-react";
import type { Conteudo, ConteudoInput, ConteudoUpdate } from "@workspace/api-client-react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Link } from "wouter";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const TIPOS = ["filme", "serie", "documentario", "animacao", "jogo", "publicidade", "outros"] as const;

const EMPTY: ConteudoInput = { titulo: "", tipo: "filme", ano_producao: new Date().getFullYear(), pais_origem: "Brasil" };

function ConteudoDialog({
  open,
  onClose,
  initial,
  conteudoId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Conteudo;
  conteudoId?: number;
}) {
  const qc = useQueryClient();
  const creating = !conteudoId;
  const [form, setForm] = useState<ConteudoInput>(() => initial
    ? { titulo: initial.titulo, titulo_original: initial.titulo_original ?? "", tipo: initial.tipo, ano_producao: initial.ano_producao, pais_origem: initial.pais_origem, distribuidora: initial.distribuidora ?? "", sinopse: initial.sinopse ?? "", duracao_min: initial.duracao_min ?? undefined }
    : EMPTY
  );

  const create = useCreateConteudo({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListConteudosQueryKey() }); toast.success("Conteúdo criado."); onClose(); },
      onError: () => toast.error("Erro ao criar conteúdo."),
    },
  });
  const update = useUpdateConteudo({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListConteudosQueryKey() }); toast.success("Conteúdo atualizado."); onClose(); },
      onError: () => toast.error("Erro ao atualizar conteúdo."),
    },
  });

  const busy = create.isPending || update.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = {
      ...form,
      titulo_original: form.titulo_original || undefined,
      distribuidora: form.distribuidora || undefined,
      sinopse: form.sinopse || undefined,
      duracao_min: form.duracao_min || undefined,
    };
    if (creating) create.mutate({ data: clean });
    else update.mutate({ id: conteudoId!, data: clean as ConteudoUpdate });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{creating ? "Novo Conteúdo" : "Editar Conteúdo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Título</Label>
              <Input required value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Título principal" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Título Original <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input value={form.titulo_original ?? ""} onChange={e => setForm(f => ({ ...f, titulo_original: e.target.value }))} placeholder="Título no idioma original" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as typeof TIPOS[number] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ano de Produção</Label>
              <Input required type="number" min={1900} max={2100} value={form.ano_producao} onChange={e => setForm(f => ({ ...f, ano_producao: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>País de Origem</Label>
              <Input required value={form.pais_origem} onChange={e => setForm(f => ({ ...f, pais_origem: e.target.value }))} placeholder="Brasil" />
            </div>
            <div className="space-y-1.5">
              <Label>Duração <span className="text-muted-foreground text-xs">(min)</span></Label>
              <Input type="number" min={1} value={form.duracao_min ?? ""} onChange={e => setForm(f => ({ ...f, duracao_min: e.target.value ? Number(e.target.value) : undefined }))} placeholder="90" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Distribuidora <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input value={form.distribuidora ?? ""} onChange={e => setForm(f => ({ ...f, distribuidora: e.target.value }))} placeholder="Nome da distribuidora" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Sinopse <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Textarea value={form.sinopse ?? ""} onChange={e => setForm(f => ({ ...f, sinopse: e.target.value }))} rows={3} placeholder="Descrição breve do conteúdo" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Conteudos() {
  const { data: conteudos, isLoading } = useListConteudos();
  const qc = useQueryClient();
  const remove = useDeleteConteudo({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListConteudosQueryKey() }); toast.success("Conteúdo excluído."); },
      onError: (err) => { const msg = (err.data as { error?: string })?.error; toast.error(msg ?? "Erro ao excluir conteúdo."); },
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Conteudo | null>(null);
  const [deleting, setDeleting] = useState<Conteudo | null>(null);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Conteúdos</h2>
            <p className="text-sm text-muted-foreground">Gerenciamento de filmes, séries, jogos e outras mídias.</p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Novo Conteúdo
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conteudos?.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.titulo}</TableCell>
                    <TableCell className="capitalize">{c.tipo}</TableCell>
                    <TableCell>{c.ano_producao}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "classificado" ? "default" : "secondary"} className="capitalize">
                        {c.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/conteudos/${c.id}`} className="text-primary hover:underline text-sm font-medium px-2 py-1">Detalhes</Link>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(c); setDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {conteudos?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhum conteúdo encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ConteudoDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing ?? undefined}
        conteudoId={editing?.id}
      />

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conteúdo?</AlertDialogTitle>
            <AlertDialogDescription>
              "<strong>{deleting?.titulo}</strong>" será removido permanentemente. Solicitações e classificações associadas também podem ser afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { remove.mutate({ id: deleting!.id }); setDeleting(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
