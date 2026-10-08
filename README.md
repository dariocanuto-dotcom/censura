# DC Censura Pro

Projeto importado do Replit para desenvolvimento local. Interface React/Vite, API Express e PostgreSQL com Drizzle.

## Preparação

Use Node.js 24 e pnpm. Execute `pnpm install` na raiz.

O banco original e suas credenciais não estão no ZIP. Para usar os dados existentes, exporte o banco no Replit e restaure em PostgreSQL. Para iniciar um banco vazio, configure DATABASE_URL e execute `pnpm --filter @workspace/db push` (revise as alterações propostas antes de confirmar).

## Rodar no PowerShell

Terminal da API:

```powershell
$env:DATABASE_URL = 'postgresql://usuario:senha@localhost:5432/censura'
$env:NODE_ENV = 'development'
pnpm --filter @workspace/api-server dev
```

Terminal da interface:

```powershell
pnpm --filter @workspace/classind dev
```

Abra http://localhost:5173. A interface encaminha /api para a API em http://localhost:3001. PORT e BASE_PATH continuam disponíveis para substituir os padrões.

## Verificação

`pnpm typecheck` e `pnpm build`.

## Vídeo SRT/ARIB

Requer FFmpeg com suporte SRT e libaribcaption/libaribb24. As rotas de vídeo precisam de validação adicional no Windows. Não estão incluídos instaladores do FFmpeg ou dados do banco.

Nunca publique credenciais. O arquivo ZIP original e arquivos .env são ignorados pelo Git.

## Banco local de testes configurado

PostgreSQL em 127.0.0.1:5433; banco censura_teste. Credenciais locais em .env (ignorado pelo Git). Binários e dados em .runtime (ignorados).

Inicie banco e API: powershell -ExecutionPolicy Bypass -File scripts/start-local-api.ps1

Em outro terminal: pnpm --filter @workspace/classind dev

Pare o banco: powershell -ExecutionPolicy Bypass -File scripts/stop-local-db.ps1

Dados fictícios de demonstração em scripts/seed-local.sql. Os dados do Replit não foram importados.
