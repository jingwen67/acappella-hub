#!/usr/bin/env python3
import argparse, json, os, secrets, subprocess, sys, webbrowser, threading
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, quote
from converter import parse_csv,convert,convert_duet,finite

ROOT=Path(__file__).resolve().parent

def score_path(folder, title, identity):
    # Separate export directories prevent overwrites while keeping the song name.
    name=''.join('_' if c in '/\\:*?"<>|' or ord(c)<32 else c for c in str(title)).strip(' .')[:100] or '歌曲'
    target=folder/'scores'/identity
    target.mkdir(parents=True,exist_ok=True)
    return target/(name+'.musicxml')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def send(self,status,data,kind='application/json'):
        if isinstance(data,dict):data=json.dumps(data,ensure_ascii=False).encode()
        self.send_response(status);self.send_header('Content-Type',kind+'; charset=utf-8');self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def allowed(self):
        expected=f'127.0.0.1:{self.server.server_port}'
        return self.headers.get('Host')==expected and self.headers.get('Origin',f'http://{expected}')==f'http://{expected}'
    def do_GET(self):
        if not self.allowed():return self.send(403,{'error':'仅允许本机页面访问。'})
        path=urlparse(self.path).path
        if path=='/':return self.send(200,(ROOT/'index.html').read_text().replace('__TOKEN__',self.server.token).encode(),'text/html')
        if path.startswith('/job/'):
            job=getattr(self.server,'jobs',{}).get(path.split('/')[-1])
            if not job:return self.send(404,{'error':'任务不存在。'})
            public=dict(job);public.pop('work',None)
            return self.send(200,public)
        if path.startswith('/media/'):
            parts=path.split('/');job=getattr(self.server,'jobs',{}).get(parts[2] if len(parts)>2 else '')
            allowed={'clip.wav','vocals.wav','accompaniment.wav'}
            if len(parts)!=4 or not job or parts[3] not in allowed:return self.send(404,{'error':'音轨不存在。'})
            file=job['work']/parts[3]
            if not file.is_file():return self.send(404,{'error':'音轨尚未就绪。'})
            return self.send(200,file.read_bytes(),'audio/wav')
        if path.startswith('/download/'):
            item=self.server.files.get(path.split('/')[-1])
            if not item:return self.send(404,{'error':'文件不存在，请重新生成。'})
            blob=item.read_bytes();self.send_response(200);self.send_header('Content-Type','application/vnd.recordare.musicxml+xml')
            self.send_header('Content-Disposition','attachment; filename="score.musicxml"; filename*=UTF-8\'\''+quote(item.name));self.send_header('Content-Length',str(len(blob)));self.end_headers();self.wfile.write(blob);return
        return self.send(404,{'error':'页面不存在。'})
    def do_POST(self):
        if not self.allowed() or self.headers.get('X-Local-Token')!=self.server.token:return self.send(403,{'error':'请从本地助手页面操作。'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=(200*1024*1024 if urlparse(self.path).path=='/upload' else 2*1024*1024):raise ValueError('请求过大或为空。')
            path=urlparse(self.path).path
            if path=='/upload':
                if length>200*1024*1024:raise ValueError('音频文件最大 200 MB。')
                id=secrets.token_hex(12);folder=self.server.output/'audio-jobs'/id;folder.mkdir(parents=True)
                target=folder/'input.bin';remaining=length
                with target.open('wb') as f:
                    while remaining:
                        block=self.rfile.read(min(1024*1024,remaining))
                        if not block:raise ValueError('上传中断，请重新选择文件。')
                        f.write(block);remaining-=len(block)
                self.server.uploads[id]=folder
                return self.send(200,{'id':id})
            data=json.loads(self.rfile.read(length))
            if path=='/analyze':
                folder=self.server.uploads.get(data.get('id'))
                if folder is None:raise ValueError('请先上传原唱文件。')
                start=finite(data.get('start',0),'片段起点');end=finite(data.get('end'),'片段终点')
                if start<0 or not 1<=end-start<=60:raise ValueError('第一版请选择 1–60 秒的片段，起点不能为负。')
                with self.server.job_lock:
                    if self.server.active:raise ValueError('已有识别任务在运行，请等待完成。')
                    self.server.active=True
                id=secrets.token_hex(12);work=folder/id;job={'status':'running','progress':'开始处理…','work':work};self.server.jobs[id]=job
                def worker():
                    try:
                        environment=dict(os.environ,OMP_NUM_THREADS='4',NUMBA_NUM_THREADS='1')
                        process=subprocess.Popen([sys.executable,str(ROOT/'audio_pipeline.py'),str(folder/'input.bin'),str(work),str(start),str(end)],
                            stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,env=environment)
                        error=None
                        for line in process.stdout:
                            if line.startswith('PROGRESS '):job.update(progress=json.loads(line[9:])['text'])
                            elif line.startswith('PIPELINE_ERROR '):error=json.loads(line[15:])['error']
                            else:print(line.strip(),flush=True)
                        code=process.wait()
                        if code:raise ValueError(error or '识别进程未完成，请检查依赖安装或换片段重试。')
                        result=json.loads((work/'analysis.json').read_text())
                        job.update(status='done',result=result)
                    except ImportError:job.update(status='failed',error='识别依赖未安装，请使用 start.command 启动并等待首次安装完成。')
                    except Exception as e:job.update(status='failed',error=str(e))
                    finally:
                        with self.server.job_lock:self.server.active=False
                threading.Thread(target=worker,daemon=True).start()
                return self.send(200,{'id':id})
            if path=='/convert-audio':
                blob,summary=convert_duet(data['solo'],data['bass'],data['settings']);id=secrets.token_hex(12)
                output=score_path(self.server.output,data['settings'].get('title'),id);output.write_bytes(blob);self.server.files[id]=output
                return self.send(200,{'id':id,'summary':summary,'path':str(output)})
            if path=='/parse':return self.send(200,{'rows':parse_csv(data['csv'])})
            if path=='/convert':
                blob,summary=convert(data['rows'],data['settings']);id=secrets.token_hex(12)
                output=score_path(self.server.output,data['settings'].get('title'),id);output.write_bytes(blob);self.server.files[id]=output
                return self.send(200,{'id':id,'summary':summary,'path':str(output)})
            if path=='/open':
                output=self.server.files.get(data.get('id'))
                if not output:raise ValueError('请先生成 MusicXML。')
                if sys.platform!='darwin':raise ValueError('自动打开目前支持 Mac；其他系统请下载文件，在 MuseScore 中打开。')
                name=str(data.get('app','')).strip()
                if not name:
                    candidates=[base/name for base in [Path('/Applications'),Path.home()/'Applications'] for name in ['MuseScore 4.app','MuseScore Studio.app','MuseScore 4.0.app']]
                    app=next((str(p) for p in candidates if p.is_dir()),'MuseScore 4')
                else:app=name
                subprocess.run(['open','-a',app,str(output)],check=True,capture_output=True,timeout=15)
                return self.send(200,{'message':'已交给 MuseScore 打开，请检查谱面。'})
            return self.send(404,{'error':'未知操作。'})
        except (ValueError,TypeError,KeyError,json.JSONDecodeError) as error:self.send(400,{'error':str(error)})
        except subprocess.CalledProcessError:self.send(400,{'error':'未找到或未能启动 MuseScore，请填写应用名称／路径，或下载文件手动打开。'})
        except subprocess.TimeoutExpired:self.send(400,{'error':'打开请求超时，请检查 MuseScore 是否已收到文件。'})
        except Exception as error:self.send(500,{'error':'操作失败：'+str(error)})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--no-browser',action='store_true');parser.add_argument('--port',type=int,default=0)
    parser.add_argument('--output-dir',type=Path,default=Path.home()/'Documents'/'CUCAC-Audio-Helper'/'exports');args=parser.parse_args()
    args.output_dir.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.token=secrets.token_hex(24);server.files={};server.output=args.output_dir;server.uploads={};server.jobs={};server.job_lock=threading.Lock();server.active=False
    url=f'http://127.0.0.1:{server.server_port}/';print('本地音频转谱助手：'+url,flush=True);print('关闭此终端或按 Ctrl+C 停止。',flush=True)
    if not args.no_browser:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
