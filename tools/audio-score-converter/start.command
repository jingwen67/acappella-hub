#!/bin/bash
set -e
cd -- "$(dirname -- "$0")"
helper_runtime="$HOME/Documents/CUCAC-Audio-Helper/runtime"
helper_python=''
for candidate in python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys;sys.exit(0 if (3,10)<=sys.version_info[:2]<=(3,12) else 1)' 2>/dev/null; then
    helper_python="$candidate"
    break
  fi
done
if [ -z "$helper_python" ]; then
  echo '音频识别需要 Python 3.10–3.12。请安装 Python 3.12 后重新运行。'
  read -r -p '按回车关闭…'
  exit 1
fi
if [ ! -f "$helper_runtime/.audio-v0.2.1-ready" ]; then
  echo '首次启动：正在安装本地音频识别依赖，请保留此终端。'
  "$helper_python" -m venv "$helper_runtime"
  "$helper_runtime/bin/python" -m pip install --upgrade pip wheel 'setuptools==75.8.0'
  if [ "$(uname -s)" = 'Darwin' ]; then
    "$helper_runtime/bin/python" -m pip install 'torch==2.5.1' 'torchaudio==2.5.1'
  else
    "$helper_runtime/bin/python" -m pip install 'torch==2.5.1' 'torchaudio==2.5.1' --index-url https://download.pytorch.org/whl/cpu
  fi
  "$helper_runtime/bin/python" -m pip install -r requirements.txt
  "$helper_runtime/bin/python" -m pip install --no-deps 'basic-pitch==0.4.0'
  "$helper_runtime/bin/python" -c 'import torch,torchaudio,librosa,onnxruntime,demucs;from basic_pitch.inference import predict'
  touch "$helper_runtime/.audio-v0.2.1-ready"
fi
exec "$helper_runtime/bin/python" app.py
