# Faz a jukebox abrir sozinha quando o Windows iniciar (ao entrar neste usuário).
# Cria um atalho minimizado na pasta "Inicializar". Não precisa de administrador.
# Para ver o que seria feito sem alterar nada: .\scripts\instalar-inicio-automatico.ps1 -WhatIf
[CmdletBinding(SupportsShouldProcess)]
param()

$raiz = Split-Path -Parent $PSScriptRoot
$bat = Join-Path $raiz 'iniciar.bat'
if (-not (Test-Path $bat)) { throw "Não achei $bat" }

$atalho = Join-Path ([Environment]::GetFolderPath('Startup')) 'Jukebox Pix.lnk'

if ($PSCmdlet.ShouldProcess($atalho, "Criar atalho que executa $bat")) {
  $shell = New-Object -ComObject WScript.Shell
  $link = $shell.CreateShortcut($atalho)
  $link.TargetPath = $bat
  $link.WorkingDirectory = $raiz
  $link.WindowStyle = 7 # minimizada
  $link.Description = 'Inicia a Jukebox Pix'
  $link.Save()
  Write-Host 'Pronto: a jukebox vai abrir sozinha quando você entrar no Windows.'
  Write-Host "Atalho: $atalho"
  Write-Host 'Dica: para o notebook ligar e entrar sozinho, configure o login automático (netplwiz) e desative a suspensão (veja o README).'
}
