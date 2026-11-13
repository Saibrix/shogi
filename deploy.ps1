# Builds the page and uploads the Worker "shogi"; then commits and pushes to the public GitHub repo.
# Usage: powershell -File deploy.ps1 -By "Opus 5.5" -Msg "what changed"
param([Parameter(Mandatory = $true)][string]$By, [string]$Msg = "Update")
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
node build.mjs
Set-Location (Join-Path $here "server")
$ErrorActionPreference = "Continue"
npx wrangler deploy
Set-Location $here
$env:Path = "$env:LOCALAPPDATA\MinGit\cmd;" + $env:Path
$env:GIT_SSL_CAINFO = "$env:LOCALAPPDATA\MinGit\ucrt64\etc\ssl\certs\ca-bundle.crt"
if (Test-Path .git) {
	git add -A
	git diff --cached --quiet
	if ($LASTEXITCODE -ne 0) {
		$f = Join-Path $env:TEMP "shogi_commit.txt"
		[IO.File]::WriteAllText($f, "[$By] " + $Msg.Replace('\n', "`n") + "`n`nCo-Authored-By: $By <noreply@anthropic.com>`n")
		git commit -q -F $f
		git push -q origin main
		Write-Output "git: committed and pushed ($By)"
	} else { Write-Output "git: nothing to commit" }
}
