<#
.SYNOPSIS
Runs the @spectrace/prelim harness end-to-end against fixtures/todo-example:
tests, typecheck, then the full CLI pipeline (requirements validate -> index
-> retrieve -> ground-truth validate -> evaluate retrieval).

.DESCRIPTION
Mirrors the manual verification steps from packages/prelim/README.md. Safe
to re-run any time; it overwrites fixtures\todo-example\index.jsonl and
fixtures\todo-example\retrieval.jsonl with freshly generated output. Stops
on the first failing step. Assumes `pnpm install` has been run at the root.

todo-example is re-indexed at the repository's current HEAD commit, not the
commit ground-truth.json was originally frozen at — symbol IDs are derived
from source paths/names, not the commit SHA, so this doesn't break
`ground-truth validate` or `evaluate retrieval` unless todo-example's actual
source code has changed since ground-truth.json was written. If you've
edited todo-example's source, re-check ground-truth.json by hand before
trusting the metrics.

.EXAMPLE
.\scripts\test-prelim.ps1
#>

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ToolDir = Join-Path $RepoRoot "packages\prelim"
$ExampleDir = Join-Path $RepoRoot "fixtures\todo-example"
$RequirementsDir = Join-Path $ExampleDir "requirements"
$IndexFile = Join-Path $ExampleDir "index.jsonl"
$RetrievalFile = Join-Path $ExampleDir "retrieval.jsonl"
$GroundTruthFile = Join-Path $ExampleDir "ground-truth.json"

function Write-Step([string]$Name) {
    Write-Host ""
    Write-Host "== $Name ==" -ForegroundColor Cyan
}

function Invoke-Checked([string]$Command, [string[]]$CommandArgs) {
    & $Command @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "FAILED (exit $LASTEXITCODE): $Command $($CommandArgs -join ' ')" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Push-Location $ToolDir
try {
    Write-Step "Unit + integration tests"
    Invoke-Checked pnpm @("test")

    Write-Step "Typecheck"
    Invoke-Checked pnpm @("typecheck")

    $Commit = (git -C $RepoRoot rev-parse HEAD).Trim()
    Write-Host ""
    Write-Host "Indexing todo-example at commit $Commit" -ForegroundColor Yellow

    Write-Step "requirements validate"
    Invoke-Checked pnpm @("exec", "tsx", "src/cli/index.ts", "requirements", "validate", "--dir", $RequirementsDir)

    Write-Step "index"
    Invoke-Checked pnpm @("exec", "tsx", "src/cli/index.ts", "index", "--repo", $ExampleDir, "--commit", $Commit, "--out", $IndexFile)

    Write-Step "retrieve"
    Invoke-Checked pnpm @("exec", "tsx", "src/cli/index.ts", "retrieve", "--requirements", $RequirementsDir, "--index", $IndexFile, "--out", $RetrievalFile, "--top-k", "10")

    Write-Step "ground-truth validate"
    Invoke-Checked pnpm @("exec", "tsx", "src/cli/index.ts", "ground-truth", "validate", "--file", $GroundTruthFile, "--requirements", $RequirementsDir, "--index", $IndexFile)

    Write-Step "evaluate retrieval"
    Invoke-Checked pnpm @("exec", "tsx", "src/cli/index.ts", "evaluate", "retrieval", "--results", $RetrievalFile, "--ground-truth", $GroundTruthFile, "--requirements", $RequirementsDir)

    Write-Host ""
    Write-Host "All checks passed." -ForegroundColor Green
}
finally {
    Pop-Location
}
