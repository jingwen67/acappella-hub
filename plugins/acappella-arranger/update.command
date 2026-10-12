#!/bin/bash
set -e
plugin_dir="$(cd -- "$(dirname -- "$0")" && pwd -P)"
if ! repo_root="$(git -C "$plugin_dir" rev-parse --show-toplevel 2>/dev/null)"; then
  echo '请先按 README 的 GitHub 安装方法安装；ZIP 副本不能直接用 Git 更新。'
  read -r -p '按回车关闭…'
  exit 1
fi
branch="$(git -C "$repo_root" branch --show-current)"
if [ "$branch" != main ]; then
  echo '此副本不在 main 分支。请使用专门的插件副本更新，避免改动你的其他开发分支。'
  read -r -p '按回车关闭…'
  exit 1
fi
if git -C "$repo_root" pull --ff-only; then
  echo '插件已同步到最新版。关闭插件窗口再重新运行；必要时重启 MuseScore。'
else
  echo '更新未完成；请检查网络或本地修改。没有自动丢弃你的文件。'
fi
read -r -p '按回车关闭…'
