import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MonitorAoVivo from "@/pages/monitor-ao-vivo";
import Dashboard from "@/pages/dashboard";
import Conteudos from "@/pages/conteudos";
import ConteudoDetalhe from "@/pages/conteudo-detalhe";
import Solicitacoes from "@/pages/solicitacoes";
import SolicitacaoDetalhe from "@/pages/solicitacao-detalhe";
import Classificacoes from "@/pages/classificacoes";
import ClassificacaoDetalhe from "@/pages/classificacao-detalhe";
import Usuarios from "@/pages/usuarios";
import Descritores from "@/pages/descritores";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/monitor" component={MonitorAoVivo} />
      <Route path="/" component={Dashboard} />
      <Route path="/conteudos" component={Conteudos} />
      <Route path="/conteudos/:id" component={ConteudoDetalhe} />
      <Route path="/solicitacoes" component={Solicitacoes} />
      <Route path="/solicitacoes/:id" component={SolicitacaoDetalhe} />
      <Route path="/classificacoes" component={Classificacoes} />
      <Route path="/classificacoes/:id" component={ClassificacaoDetalhe} />
      <Route path="/usuarios" component={Usuarios} />
      <Route path="/descritores" component={Descritores} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
