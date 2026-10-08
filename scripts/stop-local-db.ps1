$projectRoot = Split-Path $PSScriptRoot -Parent
& "$projectRoot/.runtime/pgsql/bin/pg_ctl.exe" -D "$projectRoot/.runtime/pgdata" stop -m fast
