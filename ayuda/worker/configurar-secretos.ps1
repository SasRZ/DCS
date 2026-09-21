# Guarda en Cloudflare los dos secretos del servicio de la ayuda con IA.
# Lo ejecutas tu. No hay que pegar nada en un prompt: copias el valor (Ctrl+C donde lo veas), pulsas Enter en esta ventana
# y el script lo lee del portapapeles. No se guarda en ningun archivo.
# Uso:  powershell -ExecutionPolicy Bypass -File ayuda\worker\configurar-secretos.ps1

param([switch]$SoloCodigo)     # -SoloCodigo: salta el paso 1 (la clave de Anthropic ya esta guardada)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

function Del-Portapapeles() {
    $t = Get-Clipboard -Raw
    if ($null -eq $t) { return "" }
    return ($t -replace "[\r\n]", "").Trim().Trim('"', "'")
}

function Guardar($nombre, $valor) {
    $valor | npx --yes wrangler secret put $nombre
}

if (-not $SoloCodigo) {
    Write-Host ""
    Write-Host "PASO 1 de 2 - Clave de Anthropic" -ForegroundColor Cyan
    Write-Host "1) En la consola de Anthropic, copia la clave secreta (empieza por sk-ant-api03-...)."
    Write-Host "2) Vuelve a esta ventana y pulsa Enter. Yo la leo del portapapeles."
    [void](Read-Host "Pulsa Enter cuando la tengas copiada")
    $clave = Del-Portapapeles
    if ($clave -like "apikey_*") {
        Write-Host "Has copiado el IDENTIFICADOR (apikey_...), no la clave. Se omite." -ForegroundColor Red
    } elseif (-not $clave.StartsWith("sk-ant-")) {
        Write-Host ("Lo copiado no es una clave de Anthropic (tiene {0} caracteres y empieza por '{1}'). Se omite." -f $clave.Length, $clave.Substring(0, [Math]::Min(6, $clave.Length))) -ForegroundColor Red
    } else {
        Write-Host ("Clave leida: {0} caracteres, empieza por sk-ant-. Guardando..." -f $clave.Length) -ForegroundColor Green
        Guardar "ANTHROPIC_API_KEY" $clave
    }
}

Write-Host ""
Write-Host "PASO 2 de 2 - Codigo del escuadron" -ForegroundColor Cyan
Write-Host "1) Copia el codigo (empieza por FOX3-, sin espacios)."
Write-Host "2) Vuelve a esta ventana y pulsa Enter."
[void](Read-Host "Pulsa Enter cuando lo tengas copiado")
$codigo = Del-Portapapeles
if (-not $codigo.StartsWith("FOX3-") -or $codigo.Length -lt 8) {
    Write-Host ("Lo copiado no parece el codigo (tiene {0} caracteres). Se omite." -f $codigo.Length) -ForegroundColor Red
} else {
    Write-Host ("Codigo leido: {0}. Guardando..." -f $codigo) -ForegroundColor Green
    Guardar "CODIGOS" $codigo
}

# No dejar los valores en el portapapeles
Set-Clipboard -Value " "

Write-Host ""
Write-Host "Secretos guardados ahora mismo (solo nombres):" -ForegroundColor Cyan
npx --yes wrangler secret list
