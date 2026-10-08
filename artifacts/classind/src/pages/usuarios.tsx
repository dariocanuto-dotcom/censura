import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  useListUsuarios,
  useCreateUsuario,
  useUpdateUsuario,
  useDeleteUsuario,
  getListUsuariosQueryKey,
} from "@workspace/api-client-react";
import type { Usuario, UsuarioInput, UsuarioUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PERFIS = ["administrador", "supervisor", "analista", "solicitante"] as const;

function UsuarioDialog({
  open,
  onClose,
  initial,
  usuarioId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Usuario;
  usuarioId?: number;
}) {
  const qc = useQueryClient();
  const creating = !usuarioId;

  const [form, setForm] = useState<UsuarioInput & { ativo: boolean }>(() => ({
    nome: initial?.nome ?? "",
    email: initial?.email ?? "",
    perfil: (initial?.perfil ?? "analista") as typeof PERFIS[number],
    senha: "",
    ativo: initial?.ativo ?? true,
  }));

  const create = useCreateUsuario({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListUsuariosQueryKey() }); toast.success("Usuário criado."); onClose(); },
      onError: () => toast.error("Erro ao criar usuário."),
    },
  });
  const update = useUpdateUsuario({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListUsuariosQueryKey() }); toast.success("Usuário atualizado."); onClose(); },
      onError: () => toast.error("Erro ao atualizar usuário."),
    },
  });

  const busy = create.isPending || update.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (creating) {
      create.mutate({ data: { nome: form.nome, email: form.email, perfil: form.perfil, ...(form.senha ? { senha: form.senha } : {}) } });
    } else {
      const data: UsuarioUpdate = { nome: form.nome, email: form.email, perfil: form.perfil, ativo: form.ativo };
      update.mutate({ id: usuarioId!, data });
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{creating ? "Novo Usuário" : "Editar Usuário"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input required minLength={2} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="usuario@exemplo.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={form.perfil} onValueChange={v => setForm(f => ({ ...f, perfil: v as typeof PERFIS[number] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{creating ? "Senha" : "Nova Senha (opcional)"}</Label>
            <Input type="password" required={creating} value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder={creating ? "Senha de acesso" : "Deixe em branco para manter"} />
          </div>
          {!creating && (
            <div className="flex items-center justify-between py-1">
              <Label>Usuário ativo</Label>
              <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Usuarios() {
  const { data: usuarios, isLoading } = useListUsuarios();
  const qc = useQueryClient();
  const remove = useDeleteUsuario({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListUsuariosQueryKey() }); toast.success("Usuário excluído."); },
      onError: (err) => { const msg = (err.data as { error?: string })?.error; toast.error(msg ?? "Erro ao excluir usuário."); },
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState<Usuario | null>(null);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Usuários</h2>
            <p className="text-sm text-muted-foreground">Gerenciamento de acessos e perfis.</p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />Novo Usuário
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
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios?.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="capitalize">{u.perfil}</TableCell>
                    <TableCell>
                      <Badge variant={u.ativo ? "default" : "secondary"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(u); setDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleting(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {usuarios?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <UsuarioDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        initial={editing ?? undefined}
        usuarioId={editing?.id}
      />

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
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
