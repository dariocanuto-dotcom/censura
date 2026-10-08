import { Layout } from "@/components/layout";
import { 
  useGetDashboardResumo, 
  useGetDistribuicaoFaixas, 
  useGetDistribuicaoTipos,
  useGetSolicitacoesRecentes,
  useGetDescritoresFrequentes
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, Film, ShieldCheck, Clock } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AgeBadge } from "./classificacoes";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28DFF', '#FF6666'];

export default function Dashboard() {
  const { data: resumo, isLoading: isLoadingResumo } = useGetDashboardResumo();
  const { data: faixas, isLoading: isLoadingFaixas } = useGetDistribuicaoFaixas();
  const { data: tipos, isLoading: isLoadingTipos } = useGetDistribuicaoTipos();
  const { data: recentes, isLoading: isLoadingRecentes } = useGetSolicitacoesRecentes();
  const { data: descritores, isLoading: isLoadingDescritores } = useGetDescritoresFrequentes();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Visão Geral</h2>
          <p className="text-sm text-muted-foreground">Acompanhamento de processos de classificação indicativa.</p>
        </div>

        {/* Resumo */}
        {isLoadingResumo ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : resumo ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total de Conteúdos</CardTitle>
                <Film className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumo.total_conteudos}</div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Solicitações Pendentes</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumo.solicitacoes_pendentes}</div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Em Análise</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumo.solicitacoes_em_analise}</div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Classificações</CardTitle>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{resumo.total_classificacoes}</div>
              </CardContent>
            </Card>
          </div>
        ) : null}
        
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Distribuição por Faixa Etária</CardTitle>
              <CardDescription>Quantidade de obras classificadas em cada faixa.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isLoadingFaixas ? (
                <Skeleton className="h-full w-full" />
              ) : faixas && faixas.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={faixas}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="total"
                      nameKey="faixa"
                      label
                    >
                      {faixas.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} conteúdos`, 'Total']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados suficientes</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Distribuição por Tipo</CardTitle>
              <CardDescription>Volume de conteúdos por categoria de mídia.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              {isLoadingTipos ? (
                <Skeleton className="h-full w-full" />
              ) : tipos && tipos.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tipos} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="tipo" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados suficientes</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Solicitações Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingRecentes ? (
                <Skeleton className="h-48 w-full" />
              ) : recentes && recentes.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Conteúdo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentes.map((sol) => (
                        <TableRow key={sol.id}>
                          <TableCell className="font-medium text-sm">{sol.conteudo_titulo}</TableCell>
                          <TableCell>
                            <Badge variant={sol.status === 'pendente' ? 'secondary' : 'default'} className="capitalize text-xs">
                              {sol.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(sol.criado_em).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">Nenhuma solicitação recente</div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Descritores Frequentes</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingDescritores ? (
                <Skeleton className="h-48 w-full" />
              ) : descritores && descritores.length > 0 ? (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descritor</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Frequência</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {descritores.map((desc) => (
                        <TableRow key={desc.descritor_id}>
                          <TableCell className="font-medium text-sm">{desc.nome}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">
                              {desc.categoria}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">{desc.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">Nenhum descritor registrado</div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </Layout>
  );
}
