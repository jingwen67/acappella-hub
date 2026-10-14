"""Local mixed-audio separation and draft transcription. Heavy imports are lazy."""
import json, math, os, subprocess, random
from pathlib import Path


def ffmpeg_path():
    import shutil
    found=shutil.which('ffmpeg')
    if found:return found
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def monophonic_notes(candidates,duration):
    """Choose the strongest overlapping model note, preserving repeated attacks."""
    cuts=sorted(set(max(0,min(duration,t)) for n in candidates for t in (n['start'],n['end'])))
    rows=[];current=None
    for a,b in zip(cuts,cuts[1:]):
        active=[n for n in candidates if n['start']<(a+b)/2<n['end']]
        chosen=max(active,key=lambda n:n['strength']) if active else None
        if current and chosen and current['_id']==chosen['id'] and abs(current['end']-a)<1e-6:
            current['end']=b;continue
        if current and current['end']-current['start']>=.08:rows.append(current)
        current={'start':a,'end':b,'pitch':chosen['pitch'],'_id':chosen['id']} if chosen else None
    if current and current['end']-current['start']>=.08:rows.append(current)
    for n in rows:n.pop('_id',None)
    return rows


def run(input_path,work,start,end,progress):
    import numpy as np, soundfile as sf, torch,librosa
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH
    work=Path(work);work.mkdir(parents=True,exist_ok=True)
    progress('解码所选片段…')
    clip=work/'clip.wav'
    try:subprocess.run([ffmpeg_path(),'-v','error','-i',str(input_path),'-ss',str(start),'-t',str(end-start),'-vn','-ar','44100','-ac','2','-y',str(clip)],check=True,capture_output=True,timeout=120)
    except subprocess.CalledProcessError as e:raise ValueError('音频无法解码，请换 MP3、WAV、M4A 或 MP4 文件。') from e
    samples,sr=sf.read(clip,dtype='float32',always_2d=True)
    if len(samples)/sr<1:raise ValueError('片段不足 1 秒，或时间范围超过文件长度。')
    torch.set_num_threads(min(4,os.cpu_count() or 1));torch.manual_seed(0);random.seed(0);os.environ['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD']='1'
    progress('分离人声与伴奏（首次运行会下载模型）…')
    model=get_model('htdemucs').cpu().eval();wav=torch.from_numpy(samples.T.copy());ref=wav.mean(0);std=ref.std();mean=ref.mean()
    if float(std)<1e-6:raise ValueError('所选片段几乎没有声音。')
    with torch.inference_mode():result=apply_model(model,((wav-mean)/std)[None],device='cpu',shifts=1,split=True,overlap=.25,progress=False,num_workers=0)[0]
    result=result*std+mean
    vocals=result[model.sources.index('vocals')].T.numpy()
    # Accompaniment lowest tone need not be the bass instrument. Include the
    # other (guitar/piano) stem as well as the dedicated bass stem; omit drums.
    accompaniment=(result[model.sources.index('other')]+result[model.sources.index('bass')]).T.numpy()
    gain=min(1,.98/max(float(np.max(np.abs(vocals))),float(np.max(np.abs(accompaniment))),1e-9))
    vocals*=gain;accompaniment*=gain
    sf.write(work/'vocals.wav',vocals,sr,subtype='PCM_24');sf.write(work/'accompaniment.wav',accompaniment,sr,subtype='PCM_24')
    progress('识别人声主旋律…')
    _,_,vocal_raw=predict(work/'vocals.wav',model_or_model_path=ICASSP_2022_MODEL_PATH,
        onset_threshold=.4,frame_threshold=.3,minimum_note_length=100,minimum_frequency=65.4,maximum_frequency=1046.5,melodia_trick=True)
    candidates=[{'start':float(a),'end':float(b),'pitch':int(p),'strength':float(v),'id':i} for i,(a,b,p,v,*rest) in enumerate(vocal_raw)]
    solo=monophonic_notes(candidates,len(samples)/sr)
    if not solo:raise ValueError('未识别到稳定主旋律，请换主唱更清楚的片段。')
    progress('识别伴奏中的低音与节拍…')
    outputs,_,raw=predict(work/'accompaniment.wav',model_or_model_path=ICASSP_2022_MODEL_PATH,
        onset_threshold=.5,frame_threshold=.3,minimum_note_length=140,minimum_frequency=41.2,maximum_frequency=440,melodia_trick=False)
    notes=[{'start':float(a),'end':float(b),'pitch':int(p),'strength':float(v)} for a,b,p,v,*rest in raw]
    (work/'low_note_candidates.json').write_text(json.dumps(notes),encoding='utf8')
    guitar=librosa.resample(accompaniment.mean(1),orig_sr=sr,target_sr=22050)
    tempo,frames=librosa.beat.beat_track(y=guitar,sr=22050,trim=False);tempo=float(np.asarray(tempo).reshape(-1)[0])
    beats=librosa.frames_to_time(frames,sr=22050).tolist();duration=len(samples)/sr
    if not math.isfinite(tempo) or tempo<=0 or len(beats)<4:raise ValueError('无法建立稳定拍点，请换节奏更明确或更长的片段。')
    stride=4 if tempo>130 else 2
    quarter_tempo=tempo/2 if tempo>130 else tempo
    low=min((n['pitch'] for n in notes if n['strength']>=.35),default=40)
    def score(phase):
        grid=beats[phase::stride]
        return sum(n['strength']*2**(-(n['pitch']-low)/6)*max(0,1-min(abs(n['start']-t) for t in grid)/.15) for n in notes if n['pitch']<=low+18 and n['strength']>=.35)
    phase=max(range(stride),key=score);grid=beats[phase::stride];bass=[]
    for i,t in enumerate(grid):
        stop=min(t+min(.62,60/quarter_tempo*.85),grid[i+1]-.1 if i+1<len(grid) else duration)
        found=[n for n in notes if n['strength']>=.35 and n['start']<stop and n['end']>t+.1 and min(n['end'],stop)-max(n['start'],t-.1)>=.14]
        note=min(found,key=lambda n:(n['pitch'],-n['strength'])) if found else None
        bass.append({'start':t,'end':None,'pitch':note['pitch'] if note else None})
    if not any(n['pitch'] is not None for n in bass):raise ValueError('未找到足够稳定的伴奏低音，请换片段。')
    for n in solo:n['end']=min(n['end'],duration)
    solo=[n for n in solo if n['end']>n['start']]
    result={'solo':solo,'bass':bass,'bpm':quarter_tempo,'first_beat':grid[0],
        'duration':duration,'source_offset':start,'warnings':['第一拍是自动建议，尚未确认小节线。','和声／叠唱可能干扰主旋律，伴奏低音可能漏检。']}
    (work/'analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    progress('识别完成，可以生成 Solo + Bass 草稿。');return result


if __name__=='__main__':
    import sys,traceback
    try:
        result=run(Path(sys.argv[1]),Path(sys.argv[2]),float(sys.argv[3]),float(sys.argv[4]),
            lambda text:print('PROGRESS '+json.dumps({'text':text},ensure_ascii=False),flush=True))
        print('COMPLETE',flush=True)
    except Exception as error:
        print('PIPELINE_ERROR '+json.dumps({'error':str(error)},ensure_ascii=False),flush=True)
        traceback.print_exc();sys.exit(1)
