# Desfaz o início automático (apaga o atalho da pasta "Inicializar").
[CmdletBinding(SupportsShouldProcess)]
param()

$atalho = Join-Path ([Environment]::GetFolderPath('Startup')) 'Jukebox Pix.lnk'
if (-not (Test-Path $atalho)) { Write-Host 'O início automático não estava ativado.'; return }

if ($PSCmdlet.ShouldProcess($atalho, 'Apagar atalho')) {
  Remove-Item -LiteralPath $atalho
  Write-Host 'Início automático removido.'
}
