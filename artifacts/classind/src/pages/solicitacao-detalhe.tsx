import { Layout } from "@/components/layout";
import { useGetSolicitacao } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SolicitacaoDetalhe() {
  const params = useParams();
  const id = Number(params.id);
  const { data: solicitacao, isLoading } = useGetSolicitacao(id);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Layout>
    );
  }

  if (!solicitacao) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Solicitação não encontrada.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Solicitação #{solicitacao.id}</h2>
          <Badge className="capitalize" variant={solicitacao.status === 'aprovada' ? 'default' : 'secondary'}>
            {solicitacao.status.replace('_', ' ')}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detalhes da Solicitação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block">Conteúdo</span>
              <span className="font-medium">{solicitacao.conteudo_titulo}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Solicitante</span>
              <span className="font-medium">{solicitacao.solicitante_nome}</span>
            </div>
            {solicitacao.analista_nome && (
              <div>
                <span className="text-muted-foreground block">Analista</span>
                <span className="font-medium">{solicitacao.analista_nome}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground block">Data de Criação</span>
              <span className="font-medium">{new Date(solicitacao.criado_em).toLocaleDateString()}</span>
            </div>
            {solicitacao.observacoes && (
              <div className="col-span-2">
                <span className="text-muted-foreground block">Observações</span>
                <span className="font-medium">{solicitacao.observacoes}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
