import { Layout } from "@/components/layout";
import { useGetClassificacao } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgeBadge } from "./classificacoes";

export default function ClassificacaoDetalhe() {
  const params = useParams();
  const id = Number(params.id);
  const { data: classificacao, isLoading } = useGetClassificacao(id);

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

  if (!classificacao) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Classificação não encontrada.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight">Certificado: {classificacao.numero_certificado || 'N/A'}</h2>
          <AgeBadge age={classificacao.faixa_etaria} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detalhes da Classificação</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block">Conteúdo</span>
              <span className="font-medium">{classificacao.conteudo_titulo}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Analista</span>
              <span className="font-medium">{classificacao.analista_nome}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Data de Emissão</span>
              <span className="font-medium">{new Date(classificacao.emitida_em).toLocaleDateString()}</span>
            </div>
            {classificacao.justificativa && (
              <div className="col-span-2">
                <span className="text-muted-foreground block">Justificativa</span>
                <span className="font-medium">{classificacao.justificativa}</span>
              </div>
            )}
            {classificacao.descritores && classificacao.descritores.length > 0 && (
              <div className="col-span-2">
                <span className="text-muted-foreground block">Descritores</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {classificacao.descritores.map((d) => (
                    <span key={d.id} className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
                      {d.nome}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
