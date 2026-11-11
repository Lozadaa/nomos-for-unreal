#!/usr/bin/env bash
# Nomos for Unreal installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/Lozadaa/nomos-for-unreal/main/install.sh | bash
# Checks Git, Node >= 25 and Claude Code (it never installs system software), clones or updates Nomos in ~/.nomos/app,
# links the skills into ~/.claude/skills, puts `nomos` in ~/.local/bin and runs `nomos doctor`. Run it again to update.
# No sudo. Overrides: NOMOS_HOME, NOMOS_REPO, NOMOS_BRANCH, CLAUDE_SKILLS_DIR, NOMOS_BIN_DIR, NOMOS_NO_MODIFY_PATH=1.
set -euo pipefail

# the whole script is a function, so a partial download never runs half of it (curl | bash)
main() {
NOMOS_HOME="${NOMOS_HOME:-$HOME/.nomos}"
APP="$NOMOS_HOME/app"
REPO="${NOMOS_REPO:-https://github.com/Lozadaa/nomos-for-unreal.git}"
BRANCH="${NOMOS_BRANCH:-main}"
SKILLS="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
BIN="${NOMOS_BIN_DIR:-$HOME/.local/bin}"

say()  { printf '\033[1m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# 1. Requirements: say exactly how to get what is missing, then stop.
missing=0
if ! command -v git >/dev/null 2>&1; then
  missing=1
  if [ "$(uname -s)" = Darwin ]; then warn "Git is missing. Install it with: xcode-select --install   (or: brew install git)"
  else warn "Git is missing. Install it with your package manager, e.g.: sudo apt install git   (Fedora: sudo dnf install git)"; fi
fi
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 25 ]; then
  missing=1
  warn "Node.js 25 or newer is required (found: $(node --version 2>/dev/null || echo none)). Get it from https://nodejs.org or run: nvm install 25"
fi
if ! command -v claude >/dev/null 2>&1; then
  missing=1
  warn "Claude Code is missing. Install it with: curl -fsSL https://claude.ai/install.sh | bash"
fi
[ "$missing" = 0 ] || fail "install the missing tools above and run this installer again."
command -v npm >/dev/null 2>&1 || fail "npm is missing (it ships with Node.js). Reinstall Node.js 25 from https://nodejs.org"

# 2. Clone or update.
mkdir -p "$NOMOS_HOME"
if [ -d "$APP/.git" ]; then
  say "Updating Nomos in $APP"
  git -C "$APP" fetch --quiet origin "$BRANCH"
  git -C "$APP" checkout --quiet "$BRANCH"
  git -C "$APP" merge --quiet --ff-only "origin/$BRANCH" || fail "$APP has local changes that block the update. Commit or discard them, then run again."
else
  [ ! -e "$APP" ] || fail "$APP exists but is not a Git checkout. Move it away and run again."
  say "Downloading Nomos into $APP"
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP"
fi

# 3. Build the panel (only when the code changed since the last build).
head="$(git -C "$APP" rev-parse HEAD)"
if [ "$(cat "$NOMOS_HOME/.panel-built" 2>/dev/null || true)" != "$head" ] || [ ! -f "$APP/panel/dist/index.html" ]; then
  say "Building the panel (about a minute)"
  npm --prefix "$APP/panel" ci --no-audit --no-fund --loglevel=error >/dev/null
  npm --prefix "$APP" run build --silent >/dev/null
  printf '%s\n' "$head" > "$NOMOS_HOME/.panel-built"
fi

# 4. Skills: link each one; never replace a skill with the same name that isn't this install.
mkdir -p "$SKILLS"
for dir in "$APP"/skills/*/; do
  name="$(basename "$dir")"; target="$SKILLS/$name"; dir="${dir%/}"
  if [ -L "$target" ] && [ "$(readlink "$target")" = "$dir" ]; then continue; fi
  if [ -e "$target" ] || [ -L "$target" ]; then
    warn "$target already exists and is not this Nomos install: left as is. Remove it and run again to use Nomos's '$name'."
    continue
  fi
  ln -s "$dir" "$target"
  say "Linked skill $name"
done

# 5. The `nomos` command.
mkdir -p "$BIN"
printf '#!/bin/sh\nexec node "%s/service/src/cli.ts" "$@"\n' "$APP" > "$BIN/nomos"
chmod +x "$BIN/nomos"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    line="export PATH=\"$BIN:\$PATH\""
    if [ "${NOMOS_NO_MODIFY_PATH:-}" = 1 ]; then
      warn "$BIN is not in your PATH. Add this line to your shell profile: $line"
    else
      case "${SHELL:-}" in */zsh) rc="$HOME/.zshrc" ;; */bash) rc="$HOME/.bashrc" ;; *) rc="$HOME/.profile" ;; esac
      grep -qsF "$line" "$rc" || printf '\n# Nomos for Unreal\n%s\n' "$line" >> "$rc"
      say "Added $BIN to your PATH in $rc (open a new terminal to use it)"
    fi
    export PATH="$BIN:$PATH"
    ;;
esac

# 6. Doctor: what is ready and what each missing piece costs. Unreal is only needed to build games.
say "Running nomos doctor"
mkdir -p "$NOMOS_HOME/doctor"
"$BIN/nomos" doctor --data "$NOMOS_HOME/doctor" || true

cat <<EOF

Nomos is installed. Next:
  nomos nuevo MyGame                  # a new Unreal game with Nomos inside
  cd ~/Documents/Unreal\ Projects/MyGame && claude
  /nomos                              # inside Claude Code: opens the panel
EOF
}

main "$@"
