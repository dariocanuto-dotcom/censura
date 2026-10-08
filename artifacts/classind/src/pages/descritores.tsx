import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListDescritores,
  useCreateDescritor,
  useUpdateDescritor,
  useDeleteDescritor,
  getListDescritoresQueryKey,
} from "@workspace/api-client-react";
import type { Descritor, DescritorInput, DescritorUpdate } from "@workspace/api-client-react";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIAS = ["violencia", "sexualidade", "drogas", "linguagem", "medo", "outros"] as const;

const EMPTY: DescritorInput = { nome: "", categoria: "outros", descricao: "" };

function DescritorDialog({
  open,
  onClose,
  initial,
  descritorId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Descritor;
  descritorId?: number;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DescritorInput>(
    initial ? { nome: initial.nome, categoria: initial.categoria, descricao: initial.descricao } : EMPTY
  );
  const creating = !descritorId;

  const create = useCreateDescritor({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListDescritoresQueryKey() }); toast.success("Descritor criado."); onClose(); } } });
  const update = useUpdateDescritor({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getListDescritoresQueryKey() }); toast.success("Descritor atualizado."); onClose(); } } });

  const busy = create.isPending || update.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creating) create.mutate({ data: form });
    else update.mutate({ id: descritorId!, data: form as DescritorUpdate });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creating ? "Novo Descritor" : "Editar Descritor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Violência explícita" />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v as typeof CATEGORIAS[number] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea required value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} />
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

export default function Descritores() {
  const { data: descritores, isLoading } = useListDescritores();
  const qc = useQueryClient();
  const remove = useDeleteDescritor({ mutation: {
    onSuccess: () => { qc.invalidateQueries({ queryKey: getListDescritoresQueryKey() }); toast.success("Descritor excluído."); },
    onError: (err) => { const msg = (err.data as { error?: string })?.error; toast.error(msg ?? "Erro ao excluir descritor."); },
  } });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Descritor | null>(null);
  const [deleting, setDeleting] = useState<Descritor | null>(null);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Descritores</h2>
            <p className="text-sm text-muted-foreground">Catálogo de descritores de conteúdo.</p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Novo Descritor
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {descritores?.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{d.categoria}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{d.descricao}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(d); setDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {descritores?.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Nenhum descritor encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <DescritorDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing ?? undefined}
        descritorId={editing?.id}
      />

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir descritor?</AlertDialogTitle>
            <AlertDialogDescription>
              "<strong>{deleting?.nome}</strong>" será removido permanentemente.
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
