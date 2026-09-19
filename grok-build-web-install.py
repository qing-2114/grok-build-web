#!/usr/bin/env python3
"""Locate or install Grok Build, then deploy grok-build-web and create a desktop shortcut."""

from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PS1 = ROOT / "scripts" / "open-grok-build.ps1"
ICO = ROOT / "public" / "grok-icon.ico"
PKG = ROOT / "package.json"

INSTALL_PS1 = "https://x.ai/cli/install.ps1"
INSTALL_SH = "https://x.ai/cli/install.sh"
SHORTCUT_NAME = "Grok Build.lnk"
NODE_MAJOR_MIN = 20


@dataclass
class GrokInstall:
    path: Path
    version: str
    detail: str


def log(msg: str) -> None:
    print(msg, flush=True)


def fail(msg: str, code: int = 1) -> None:
    print(f"错误：{msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def ps_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def grok_bin_dir() -> Path:
    return Path.home() / ".grok" / "bin"


def prepend_path(directory: Path) -> None:
    if not directory.is_dir():
        return
    current = os.environ.get("PATH", "")
    prefix = str(directory)
    parts = current.split(os.pathsep) if current else []
    if parts and os.path.normcase(parts[0]) == os.path.normcase(prefix):
        return
    os.environ["PATH"] = os.pathsep.join([prefix, *parts]) if parts else prefix


def grok_candidates() -> list[Path]:
    names = ("grok.exe", "grok")
    found: list[Path] = []
    seen: set[str] = set()

    def add(path: Path | None) -> None:
        if path is None:
            return
        try:
            resolved = path.expanduser().resolve()
        except OSError:
            return
        if not resolved.is_file():
            return
        key = os.path.normcase(str(resolved))
        if key in seen:
            return
        seen.add(key)
        found.append(resolved)

    for name in names:
        which = shutil.which(name)
        if which:
            add(Path(which))

    bindir = grok_bin_dir()
    for name in names:
        add(bindir / name)

    extra = os.environ.get("GROK_BIN") or os.environ.get("GROK_HOME")
    if extra:
        extra_path = Path(extra)
        add(extra_path)
        add(extra_path / "bin" / ("grok.exe" if os.name == "nt" else "grok"))
        add(extra_path / ("grok.exe" if os.name == "nt" else "grok"))

    return found


def run_capture(args: list[str], extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
    )


def parse_grok_version(text: str) -> str:
    match = re.search(r"\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?)\b", text)
    if match:
        return match.group(1)
    line = text.strip().splitlines()[0].strip() if text.strip() else ""
    return line


def version_from_json() -> str:
    path = Path.home() / ".grok" / "version.json"
    if not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    match = re.search(r'"version"\s*:\s*"([^"]+)"', text)
    return match.group(1) if match else ""


def probe_grok(path: Path) -> GrokInstall | None:
    result = run_capture([str(path), "--version"])
    detail = (result.stdout or result.stderr).strip()
    version = parse_grok_version(detail) or version_from_json()
    if result.returncode != 0 and not version:
        return None
    if not version:
        version = "未知"
    if not detail:
        detail = version
    return GrokInstall(path=path, version=version, detail=detail)


def find_grok() -> GrokInstall | None:
    prepend_path(grok_bin_dir())
    for path in grok_candidates():
        info = probe_grok(path)
        if info:
            return info
    version = version_from_json()
    fallback = grok_bin_dir() / ("grok.exe" if os.name == "nt" else "grok")
    if fallback.is_file() and version:
        return GrokInstall(path=fallback, version=version, detail=version)
    return None


def install_grok() -> None:
    log("未找到 Grok Build，开始运行官方一键安装脚本…")
    if os.name == "nt":
        command = f"irm {INSTALL_PS1} | iex"
        cmd = [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command,
        ]
    else:
        if shutil.which("curl") is None:
            fail("未找到 curl，无法运行官方安装脚本。请先安装 curl，或手动执行：\n"
                 f"  curl -fsSL {INSTALL_SH} | bash")
        bash = shutil.which("bash") or shutil.which("zsh") or shutil.which("sh")
        if not bash:
            fail("未找到 bash/sh，无法运行官方安装脚本。")
        cmd = [bash, "-lc", f"curl -fsSL {INSTALL_SH} | bash"]

    result = subprocess.run(cmd)
    if result.returncode != 0:
        fail(f"Grok Build 安装失败（退出码 {result.returncode}）。")
    prepend_path(grok_bin_dir())


def which_node() -> str | None:
    if os.name == "nt":
        return shutil.which("node.exe") or shutil.which("node")
    return shutil.which("node")


def which_npm() -> str | None:
    if os.name == "nt":
        return shutil.which("npm.cmd") or shutil.which("npm.exe")
    return shutil.which("npm")


def node_major(version_text: str) -> int:
    text = version_text.strip().lstrip("vV")
    major = text.split(".", 1)[0]
    if not major.isdigit():
        fail(f"无法解析 Node.js 版本：{version_text.strip()!r}")
    return int(major)


def ensure_node() -> tuple[str, str]:
    node = which_node()
    npm = which_npm()
    if not node or not npm:
        fail(
            "未找到 Node.js / npm。本仓库需要 Node 20+。\n"
            "请安装：https://nodejs.org/  然后重新运行本脚本。"
        )
    node_ver = run_capture([node, "--version"])
    npm_ver = run_capture([npm, "--version"])
    if node_ver.returncode != 0:
        fail("无法执行 node --version。")
    if npm_ver.returncode != 0:
        fail("无法执行 npm --version。")
    major = node_major(node_ver.stdout)
    if major < NODE_MAJOR_MIN:
        fail(
            f"Node.js 版本过低（当前 {node_ver.stdout.strip()}，需要 {NODE_MAJOR_MIN}+）。\n"
            "请升级：https://nodejs.org/"
        )
    return node_ver.stdout.strip(), npm_ver.stdout.strip()


def npm_install() -> None:
    npm = which_npm()
    if not npm:
        fail("未找到 npm。")
    log(f"在 {ROOT} 执行 npm install …")
    result = subprocess.run([npm, "install"], cwd=str(ROOT))
    if result.returncode != 0:
        fail(f"npm install 失败（退出码 {result.returncode}）。")


def desktop_dir() -> Path:
    if os.name == "nt":
        result = run_capture(
            [
                "powershell.exe",
                "-NoProfile",
                "-Command",
                "[Environment]::GetFolderPath('Desktop')",
            ]
        )
        path = (result.stdout or "").strip()
        if result.returncode == 0 and path:
            return Path(path)
    xdg = os.environ.get("XDG_DESKTOP_DIR")
    if xdg:
        return Path(xdg)
    return Path.home() / "Desktop"


def powershell_exe() -> str:
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    candidate = Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    if candidate.is_file():
        return str(candidate)
    found = shutil.which("powershell.exe") or shutil.which("powershell")
    if not found:
        fail("未找到 powershell.exe，无法创建 .lnk 快捷方式。")
    return found


def create_windows_shortcut(lnk: Path) -> None:
    if not PS1.is_file():
        fail(f"缺少启动脚本：{PS1}")
    target = powershell_exe()
    arguments = (
        "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden "
        f'-File "{PS1}"'
    )
    icon = str(ICO) if ICO.is_file() else ""
    script = f"""
$ErrorActionPreference = 'Stop'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut({ps_quote(str(lnk))})
$s.TargetPath = {ps_quote(target)}
$s.Arguments = {ps_quote(arguments)}
$s.WorkingDirectory = {ps_quote(str(ROOT))}
$s.WindowStyle = 7
$s.Description = {ps_quote("启动 Grok Build Web 操作台")}
"""
    if icon:
        script += f"$s.IconLocation = {ps_quote(icon)}\n"
    script += "$s.Save()\n"

    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-STA", "-Command", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()
        fail("创建桌面快捷方式失败。" + (f"\n{err}" if err else ""))


def create_unix_launcher(desktop: Path) -> Path:
    desktop.mkdir(parents=True, exist_ok=True)
    launcher = desktop / "Grok Build.command"
    opener = "open" if sys.platform == "darwin" else "xdg-open"
    body = f"""#!/bin/sh
set -e
cd {shlex.quote(str(ROOT))}
(
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    if command -v curl >/dev/null 2>&1 && curl -fsS http://127.0.0.1:5173/ >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  {opener} http://127.0.0.1:5173/ >/dev/null 2>&1 || true
) &
exec npm run dev
"""
    launcher.write_text(body, encoding="utf-8")
    launcher.chmod(launcher.stat().st_mode | 0o111)
    return launcher


def create_shortcut() -> Path:
    desktop = desktop_dir()
    desktop.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        lnk = desktop / SHORTCUT_NAME
        create_windows_shortcut(lnk)
        if not lnk.is_file():
            fail(f"快捷方式未生成：{lnk}")
        return lnk
    return create_unix_launcher(desktop)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    if not PKG.is_file():
        fail(f"这里不是 grok-build-web 仓库根目录（缺少 package.json）：{ROOT}")

    log("Grok Build Web 一键部署")
    log("=" * 28)

    log("\n[1/4] 查找本机 Grok Build")
    info = find_grok()
    if info is None:
        install_grok()
        info = find_grok()
        if info is None:
            fail(
                "安装脚本已结束，但仍找不到 grok。\n"
                f"请确认 {grok_bin_dir()} 是否存在，或重新打开终端后再运行本脚本。"
            )
        log(f"已安装：{info.path}")
        log(f"版本：{info.version}")
        if info.detail and info.detail != info.version:
            log(f"详情：{info.detail}")
    else:
        log(f"路径：{info.path}")
        log(f"版本：{info.version}")
        if info.detail and info.detail != info.version:
            log(f"详情：{info.detail}")

    log("\n[2/4] 检查 Node.js")
    node_ver, npm_ver = ensure_node()
    log(f"Node {node_ver}  npm {npm_ver}")

    log("\n[3/4] 部署本仓库依赖")
    npm_install()
    log("npm install 完成")

    log("\n[4/4] 创建桌面快捷方式")
    lnk = create_shortcut()
    log(f"已创建：{lnk}")

    log("\n完成。")
    log("双击桌面上的「Grok Build」即可启动本机操作台（http://127.0.0.1:5173/）。")


if __name__ == "__main__":
    main()
