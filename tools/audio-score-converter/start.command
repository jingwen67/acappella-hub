#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo '请先安装 Python 3，再运行此文件。'
  read -r -p '按回车关闭…'
  exit 1
fi
exec python3 app.py
