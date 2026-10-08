$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
foreach ($line in Get-Content .env) {
    if ($line -match '^([A-Z_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
& "$projectRoot/.runtime/pgsql/bin/pg_ctl.exe" -D "$projectRoot/.runtime/pgdata" status *> $null
if ($LASTEXITCODE -ne 0) {
    & "$projectRoot/.runtime/pgsql/bin/pg_ctl.exe" -D "$projectRoot/.runtime/pgdata" -l "$projectRoot/.runtime/postgresql.log" start
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar PostgreSQL' }
}
$ffmpegBin = Get-ChildItem "$projectRoot/.runtime/ffmpeg-full" -Directory | ForEach-Object { Join-Path $_.FullName 'bin' } | Where-Object { Test-Path (Join-Path $_ 'ffprobe.exe') } | Select-Object -First 1
if ($ffmpegBin) { $env:PATH = $ffmpegBin + ';' + $env:PATH }
$env:NODE_ENV = 'development'
pnpm --filter @workspace/api-server dev


