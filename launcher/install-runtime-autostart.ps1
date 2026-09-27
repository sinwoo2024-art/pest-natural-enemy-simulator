$ErrorActionPreference='Stop'
$scriptPath=(Resolve-Path (Join-Path $PSScriptRoot 'watch-runtime.ps1')).Path
$powershellPath=(Get-Command powershell.exe -ErrorAction Stop).Source
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskName='GongsaengAI Runtime Recovery'
if(Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue){throw 'Task already exists; inspect before replacing it.'}
$action=New-ScheduledTaskAction -Execute $powershellPath -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
$triggers=@((New-ScheduledTaskTrigger -AtLogOn -User $user),(New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Principal $principal -Settings $settings -Description 'Start missing Gongsaeng AI app processes at logon and recover exits; does not change Cloudflare or power settings.' | Out-Null
  Start-ScheduledTask -TaskName $taskName
  Write-Output 'Installed unlimited-duration logon supervisor (30-second checks, one-minute task recovery trigger).'
} catch {
  # Some Windows installations disallow task registration by standard users.
  $startup=[Environment]::GetFolderPath('Startup')
  $linkPath=Join-Path $startup 'GongsaengAI Runtime Recovery.lnk'
  if(Test-Path $linkPath){throw 'Startup shortcut already exists; inspect before replacing it.'}
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut($linkPath)
  $shortcut.TargetPath=$powershellPath
  $shortcut.Arguments="-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
  $shortcut.WorkingDirectory=Split-Path $scriptPath
  $shortcut.WindowStyle=7
  $shortcut.Save()
  Start-Process -FilePath $powershellPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden | Out-Null
  Write-Output 'Task registration unavailable; installed current-user startup shortcut with 30-second recovery loop.'
}
