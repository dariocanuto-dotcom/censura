import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Film,
  FileText,
  ShieldCheck,
  Users,
  Tags,
  MonitorPlay,
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/monitor", label: "Monitor Ao Vivo", icon: MonitorPlay },
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/conteudos", label: "Conteúdos", icon: Film },
    { href: "/solicitacoes", label: "Solicitações", icon: FileText },
    { href: "/classificacoes", label: "Classificações", icon: ShieldCheck },
    { href: "/usuarios", label: "Usuários", icon: Users },
    { href: "/descritores", label: "Descritores", icon: Tags },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="w-64 flex-shrink-0 border-r bg-sidebar">
        <div className="flex h-14 items-center px-4 border-b border-sidebar-border bg-sidebar-primary">
          <span className="font-semibold text-sidebar-primary-foreground tracking-tight">ClassInd</span>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                }`}
                data-testid={`nav-link-${item.label.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 border-b bg-card flex items-center px-6 shrink-0">
          <h1 className="font-medium text-sm text-muted-foreground">DC CENSURA PRO — Engenheiro Dário Canuto</h1>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
