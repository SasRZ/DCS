# Guarda en Cloudflare los dos secretos del servicio de la ayuda con IA.
# Lo ejecutas tu: te pide cada valor con la entrada oculta (no se ve al escribir ni al pegar) y no lo guarda en ningun archivo.
# Uso:  powershell -ExecutionPolicy Bypass -File ayuda\worker\configurar-secretos.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

function Pedir($texto) {
    $seguro = Read-Host $texto -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Guardar($nombre, $valor) {
    if (-not $valor) { Write-Host "No has escrito nada: se omite $nombre." -ForegroundColor Yellow; return }
    $valor | npx --yes wrangler secret put $nombre
}

Write-Host ""
Write-Host "PASO 1 de 2 - Clave de Anthropic" -ForegroundColor Cyan
Write-Host "Es la clave secreta, la que empieza por sk-ant-api03-... (no el identificador apikey_...)."
Write-Host "Pegala (clic derecho o Ctrl+V) y pulsa Enter. No se ve nada al pegar: es normal."
$clave = Pedir "Clave de Anthropic"
if ($clave -like "apikey_*") {
    Write-Host "Eso es el IDENTIFICADOR de la clave, no la clave. Se omite." -ForegroundColor Red; $clave = $null
} elseif ($clave -and -not $clave.StartsWith("sk-ant-")) {
    Write-Host "Eso no parece una clave de Anthropic (debe empezar por sk-ant-). Se omite." -ForegroundColor Red; $clave = $null
}
Guardar "ANTHROPIC_API_KEY" $clave

Write-Host ""
Write-Host "PASO 2 de 2 - Codigo del escuadron" -ForegroundColor Cyan
Write-Host "Escribe el codigo de acceso que te he dado (empieza por FOX3-) y pulsa Enter."
$codigo = Pedir "Codigo del escuadron"
Guardar "CODIGOS" $codigo

Write-Host ""
Write-Host "Secretos guardados ahora mismo (solo nombres):" -ForegroundColor Cyan
npx --yes wrangler secret list
