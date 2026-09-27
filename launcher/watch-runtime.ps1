param([switch]$Once)
$ErrorActionPreference='Stop'
$projectRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDir=Join-Path $projectRoot 'tmp/runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$digest=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot))).Replace('-','')
$mutex=[Threading.Mutex]::new($false,"Local\GongsaengRuntime_$digest")
if(-not $mutex.WaitOne(0)){ $mutex.Dispose(); exit 0 }
try {
  do {
    try {
      # A deployer can temporarily pause recovery without stopping the supervisor.
      if(-not (Test-Path (Join-Path $runtimeDir 'maintenance'))) {
        $services=@(
          @{Name='backend';Port=8000;Directory=(Join-Path $projectRoot 'backend');Executable=(Join-Path $projectRoot 'backend/.venv/Scripts/python.exe');Arguments=@('-m','uvicorn','main:app','--host','127.0.0.1','--port','8000')},
          @{Name='frontend';Port=3000;Directory=(Join-Path $projectRoot 'frontend');Executable=(Get-Command node.exe -ErrorAction Stop).Source;Arguments=@('node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000')}
        )
        foreach($service in $services) {
          # Never kill a process merely because it owns an application port.
          $listener=Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue
          if($listener){continue}
          if($service.Name -eq 'frontend' -and -not (Test-Path (Join-Path $service.Directory '.next/BUILD_ID'))){continue}
          $stampFile=Join-Path $runtimeDir ($service.Name+'.last-start')
          if(Test-Path $stampFile) {
            $savedPid=0
            if([int]::TryParse((Get-Content -LiteralPath $stampFile -Raw).Trim(),[ref]$savedPid)) {
              $starting=Get-Process -Id $savedPid -ErrorAction SilentlyContinue
              if($starting -and [Math]::Abs(($starting.StartTime-(Get-Item $stampFile).LastWriteTime).TotalSeconds) -lt 10){continue}
            }
          }
          if((Test-Path $stampFile) -and ((Get-Date)-(Get-Item $stampFile).LastWriteTime).TotalSeconds -lt 120){continue}
          $env:BACKEND_API_URL='http://127.0.0.1:8000'
          $env:INTERNAL_FRONTEND_URL='http://127.0.0.1:3000'
          $started=Start-Process -FilePath $service.Executable -ArgumentList $service.Arguments -WorkingDirectory $service.Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir ($service.Name+'.log')) -RedirectStandardError (Join-Path $runtimeDir ($service.Name+'.err.log')) -PassThru
          Set-Content -LiteralPath $stampFile -Value $started.Id
          Write-Output "Started $($service.Name), PID $($started.Id)"
        }
      }
    } catch {
      # No exception text: process launch arguments or environment may be sensitive.
      Write-Warning 'Runtime recovery could not complete; check local runtime logs and executable paths.'
    }
    if(-not $Once){Start-Sleep -Seconds 30}
  } while(-not $Once)
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
