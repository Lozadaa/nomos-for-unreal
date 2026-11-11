# Nomos for Unreal installer for Windows.
#   irm https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.ps1 | iex
# Checks Git, Node >= 25 and Claude Code (it never installs system software), clones or updates Nomos in
# %USERPROFILE%\.nomos\app, links the skills into %USERPROFILE%\.claude\skills, puts nomos.cmd in %USERPROFILE%\.nomos\bin
# (added to your user PATH only) and runs `nomos doctor`. Run it again to update. No administrator rights.
# Overrides: NOMOS_HOME, NOMOS_REPO, NOMOS_BRANCH, CLAUDE_SKILLS_DIR, NOMOS_BIN_DIR, NOMOS_NO_MODIFY_PATH=1.

function Install-Nomos {
  $ErrorActionPreference = 'Stop'
  $home_ = if ($env:NOMOS_HOME) { $env:NOMOS_HOME } else { Join-Path $env:USERPROFILE '.nomos' }
  $app = Join-Path $home_ 'app'
  $repo = if ($env:NOMOS_REPO) { $env:NOMOS_REPO } else { 'https://github.com/Lozadaa/nomos-for-unreal.git' }
  $branch = if ($env:NOMOS_BRANCH) { $env:NOMOS_BRANCH } else { 'main' }
  $skills = if ($env:CLAUDE_SKILLS_DIR) { $env:CLAUDE_SKILLS_DIR } else { Join-Path $env:USERPROFILE '.claude\skills' }
  $bin = if ($env:NOMOS_BIN_DIR) { $env:NOMOS_BIN_DIR } else { Join-Path $home_ 'bin' }
  function Say($m) { Write-Host "==> $m" }
  function Warn($m) { Write-Host "warning: $m" -ForegroundColor Yellow }
  function Has($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
  # after a native command: stop on a non-zero exit code
  function Ok($what) { if ($LASTEXITCODE) { throw "$what failed (exit $LASTEXITCODE)" } }

  # 1. Requirements: say exactly how to get what is missing, then stop.
  $missing = $false
  if (-not (Has git)) { $missing = $true; Warn 'Git is missing. Install it with: winget install --id Git.Git -e   (or from https://git-scm.com)' }
  $node = if (Has node) { [int]((node -p 'process.versions.node') -split '\.')[0] } else { 0 }
  if ($node -lt 25) { $missing = $true; Warn "Node.js 25 or newer is required (found: $(if ($node) { node --version } else { 'none' })). Install it with: winget install OpenJS.NodeJS   (or from https://nodejs.org)" }
  if (-not (Has claude)) { $missing = $true; Warn 'Claude Code is missing. Install it with: irm https://claude.ai/install.ps1 | iex' }
  if ($missing) { Write-Host 'Install the missing tools above, open a new terminal and run this installer again.' -ForegroundColor Red; return }

  # 2. Clone or update.
  New-Item -ItemType Directory -Force $home_ | Out-Null
  if (Test-Path (Join-Path $app '.git')) {
    Say "Updating Nomos in $app"
    git -C $app fetch --quiet origin $branch; Ok 'git fetch'
    git -C $app checkout --quiet $branch; Ok 'git checkout'
    git -C $app merge --quiet --ff-only "origin/$branch"
    if ($LASTEXITCODE) { throw "$app has local changes that block the update. Commit or discard them, then run again." }
  } else {
    if (Test-Path $app) { throw "$app exists but is not a Git checkout. Move it away and run again." }
    Say "Downloading Nomos into $app"
    git clone --quiet --branch $branch $repo $app; Ok 'git clone'
  }

  # 3. Build the panel (only when the code changed since the last build).
  $head = (git -C $app rev-parse HEAD).Trim()
  $stamp = Join-Path $home_ '.panel-built'
  if ((Get-Content $stamp -ErrorAction SilentlyContinue) -ne $head -or -not (Test-Path (Join-Path $app 'panel\dist\index.html'))) {
    Say 'Building the panel (about a minute)'
    npm --prefix (Join-Path $app 'panel') ci --no-audit --no-fund --loglevel=error | Out-Null; Ok 'npm ci'
    npm --prefix $app run build --silent | Out-Null; Ok 'npm run build'
    Set-Content $stamp $head
  }

  # 4. Skills: a junction per skill (no admin needed); never replace a skill with the same name that isn't this install.
  New-Item -ItemType Directory -Force $skills | Out-Null
  foreach ($dir in Get-ChildItem (Join-Path $app 'skills') -Directory) {
    $target = Join-Path $skills $dir.Name
    $item = Get-Item $target -Force -ErrorAction SilentlyContinue
    if ($item) {
      $points = @($item.Target) | Where-Object { $_ } | ForEach-Object { [IO.Path]::GetFullPath(($_ -replace '^\\\\\?\\', '')).TrimEnd('\') }
      if ($points -contains $dir.FullName.TrimEnd('\')) { continue }
      Warn "$target already exists and is not this Nomos install: left as is. Remove it and run again to use Nomos's '$($dir.Name)'."
      continue
    }
    New-Item -ItemType Junction -Path $target -Target $dir.FullName | Out-Null
    Say "Linked skill $($dir.Name)"
  }

  # 5. The `nomos` command, on the user PATH (never the system PATH).
  New-Item -ItemType Directory -Force $bin | Out-Null
  $cmd = Join-Path $bin 'nomos.cmd'
  Set-Content $cmd "@echo off`r`nnode `"$app\service\src\cli.ts`" %*" -Encoding ascii
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (($userPath -split ';') -contains $bin)) {
    if ($env:NOMOS_NO_MODIFY_PATH -eq '1') { Warn "$bin is not in your PATH. Add it to your user PATH to run nomos from anywhere." }
    else {
      [Environment]::SetEnvironmentVariable('Path', (@($userPath, $bin) | Where-Object { $_ }) -join ';', 'User')
      Say "Added $bin to your user PATH (new terminals will see it)"
    }
  }
  if (-not (($env:Path -split ';') -contains $bin)) { $env:Path = "$bin;$env:Path" }

  # 6. Doctor: what is ready and what each missing piece costs. Unreal is only needed to build games.
  Say 'Running nomos doctor'
  $doctor = Join-Path $home_ 'doctor'
  New-Item -ItemType Directory -Force $doctor | Out-Null
  & $cmd doctor --data $doctor

  Write-Host ''
  Write-Host 'Nomos is installed. Next:'
  Write-Host '  nomos nuevo MyGame                  # a new Unreal game with Nomos inside'
  Write-Host '  cd "$env:USERPROFILE\Documents\Unreal Projects\MyGame"; claude'
  Write-Host '  /nomos                              # inside Claude Code: opens the panel'
}

Install-Nomos
