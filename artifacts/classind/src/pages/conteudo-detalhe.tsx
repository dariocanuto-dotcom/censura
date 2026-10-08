import { Layout } from "@/components/layout";
import { useGetConteudo } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ConteudoDetalhe() {
  const params = useParams();
  const id = Number(params.id);
  const { data: conteudo, isLoading } = useGetConteudo(id);

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

  if (!conteudo) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Conteúdo não encontrado.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">{conteudo.titulo}</h2>
          <Badge className="capitalize" variant={conteudo.status === 'classificado' ? 'default' : 'secondary'}>
            {conteudo.status.replace('_', ' ')}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detalhes do Conteúdo</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block">Tipo</span>
              <span className="font-medium capitalize">{conteudo.tipo}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Ano de Produção</span>
              <span className="font-medium">{conteudo.ano_producao}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">País de Origem</span>
              <span className="font-medium">{conteudo.pais_origem}</span>
            </div>
            {conteudo.distribuidora && (
              <div>
                <span className="text-muted-foreground block">Distribuidora</span>
                <span className="font-medium">{conteudo.distribuidora}</span>
              </div>
            )}
            {conteudo.sinopse && (
              <div className="col-span-2">
                <span className="text-muted-foreground block">Sinopse</span>
                <span className="font-medium">{conteudo.sinopse}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
