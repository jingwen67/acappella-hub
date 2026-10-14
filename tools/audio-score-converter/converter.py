"""Quantize a monophonic CSV draft and write editable MusicXML (stdlib only)."""
import csv, io, math
from fractions import Fraction
from xml.etree import ElementTree as ET

DIVISIONS=24
METERS={'4/4':(4,4),'3/4':(3,4),'2/4':(2,4),'6/8':(6,8),'9/8':(9,8),'12/8':(12,8)}

def finite(value,label):
    try: value=float(value)
    except (ValueError,TypeError): raise ValueError(label+'必须是数字。')
    if not math.isfinite(value): raise ValueError(label+'必须是有限数字。')
    return value

def parse_csv(text):
    reader=csv.DictReader(io.StringIO(text.lstrip('\ufeff')))
    if not reader.fieldnames or 'midi_pitch' not in reader.fieldnames: raise ValueError('CSV 需要 midi_pitch 列。')
    time_column='clip_time_seconds' if 'clip_time_seconds' in reader.fieldnames else 'start_seconds'
    if time_column not in reader.fieldnames: raise ValueError('CSV 需要 clip_time_seconds 或 start_seconds 列。')
    rows=[]
    for i,row in enumerate(reader,2):
        start=finite(row[time_column],f'第 {i} 行起音时间')
        pitch=row.get('midi_pitch','').strip()
        if pitch:
            p=finite(pitch,f'第 {i} 行 MIDI 音高')
            if int(p)!=p or not 0<=p<=127: raise ValueError(f'第 {i} 行 MIDI 音高需为 0–127 整数。')
            pitch=int(p)
        else: pitch=None
        end=row.get('end_seconds','').strip()
        rows.append({'start':start,'end':finite(end,'结束时间') if end else None,'pitch':pitch})
    if not rows or len(rows)>4096: raise ValueError('CSV 需包含 1–4096 个位置。')
    return rows

def validate_rows(rows):
    if not isinstance(rows,list) or not 1<=len(rows)<=4096: raise ValueError('需要 1–4096 个音符位置。')
    result=[]
    for row in rows:
        start=finite(row.get('start'),'起音时间');end=row.get('end');pitch=row.get('pitch')
        if end is not None and end!='':
            end=finite(end,'结束时间')
            if end<=start: raise ValueError('结束时间必须晚于起音时间。')
        else: end=None
        if pitch is not None and pitch!='':
            pitch=finite(pitch,'MIDI 音高')
            if int(pitch)!=pitch or not 0<=pitch<=127: raise ValueError('MIDI 音高需为 0–127 整数。')
            pitch=int(pitch)
        else: pitch=None
        result.append({'start':start,'end':end,'pitch':pitch})
    return sorted(result,key=lambda r:r['start'])

def quantize(rows,bpm,first_beat,meter,grid='strong',beat_unit='quarter'):
    rows=validate_rows(rows);bpm=finite(bpm,'速度');first_beat=finite(first_beat,'第一拍位置')
    if not 20<=bpm<=300: raise ValueError('速度需在 20–300 BPM 之间。')
    if meter not in METERS: raise ValueError('不支持此拍号。')
    if beat_unit not in ('quarter','dotted-quarter'): raise ValueError('速度单位无效。')
    unit=Fraction(3,2) if beat_unit=='dotted-quarter' else Fraction(1)
    grids={'strong':Fraction(3,2) if meter in ('6/8','9/8','12/8') else Fraction(2) if meter=='4/4' else Fraction(1),
           'quarter':Fraction(1),'eighth':Fraction(1,2),'sixteenth':Fraction(1,4)}
    if grid not in grids: raise ValueError('量化精度无效。')
    quantum=grids[grid];steps=[];warnings=[]
    def snap(time):
        quarters=Fraction(str(time-first_beat))*Fraction(str(bpm))/60*unit
        return math.floor(quarters/quantum+Fraction(1,2))*quantum
    for r in rows:
        at=snap(r['start']);item={'start':at,'pitch':r['pitch'],'end':snap(r['end']) if r['end'] is not None else None}
        if steps and steps[-1]['start']==at:
            steps[-1]=item;warnings.append('两个位置落在同一量化点，保留后一个；请核对。')
        else: steps.append(item)
    notes=[]
    for i,r in enumerate(steps):
        if r['pitch'] is None: continue
        next_start=steps[i+1]['start'] if i+1<len(steps) else r['end'] if r['end'] is not None else r['start']+quantum
        end=min(r['end'],next_start) if r['end'] is not None else next_start
        if end<=r['start']: warnings.append('量化后时值为零的音已跳过。');continue
        notes.append({'start':r['start'],'end':end,'pitch':r['pitch']})
    if not notes: raise ValueError('没有可输出的有声音符。')
    offset=max(Fraction(0),-min(n['start'] for n in notes))
    for n in notes:n['start']+=offset;n['end']+=offset
    return notes,offset,list(dict.fromkeys(warnings))

def add(parent,tag,text=None,**attrs):
    node=ET.SubElement(parent,tag,attrs)
    if text is not None:node.text=str(text)
    return node

def spell(pitch,fifths):
    sharp=[('C',0),('C',1),('D',0),('D',1),('E',0),('F',0),('F',1),('G',0),('G',1),('A',0),('A',1),('B',0)]
    flat=[('C',0),('D',-1),('D',0),('E',-1),('E',0),('F',0),('G',-1),('G',0),('A',-1),('A',0),('B',-1),('B',0)]
    step,alter=(flat if fifths<0 else sharp)[pitch%12]
    # Spell E# / B# or Cb / Fb in extreme key signatures.
    if fifths>=6 and pitch%12==5:step,alter='E',1
    if fifths>=7 and pitch%12==0:step,alter='B',1
    if fifths<=-6 and pitch%12==11:step,alter='C',-1
    if fifths<=-7 and pitch%12==4:step,alter='F',-1
    natural={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[step]
    octave=(pitch-natural-alter)//12-1
    return step,alter,octave

def split_duration(length):
    types=[(Fraction(6),'whole',1),(Fraction(4),'whole',0),(Fraction(3),'half',1),(Fraction(2),'half',0),
           (Fraction(3,2),'quarter',1),(Fraction(1),'quarter',0),(Fraction(3,4),'eighth',1),(Fraction(1,2),'eighth',0),
           (Fraction(3,8),'16th',1),(Fraction(1,4),'16th',0)]
    result=[]
    for duration,name,dots in types:
        while length>=duration:result.append((duration,name,dots));length-=duration
    if length:raise ValueError('不支持此量化时值。')
    return result

def convert(rows,settings):
    bpm=finite(settings.get('bpm',80),'速度');meter=settings.get('meter','4/4');unit=settings.get('beat_unit','quarter')
    notes,pickup,warnings=quantize(rows,bpm,settings.get('first_beat',0),meter,settings.get('grid','strong'),unit)
    fifths=finite(settings.get('fifths',0),'调号')
    if int(fifths)!=fifths or not -7<=fifths<=7:raise ValueError('调号需为 -7–7 整数。')
    fifths=int(fifths);beats,denominator=METERS[meter];bar_length=Fraction(beats*4,denominator)
    if pickup>=bar_length:raise ValueError('第一拍之前超过一个完整小节，请调整第一拍位置。')
    end=max(n['end'] for n in notes);boundaries=[];at=Fraction(0)
    if pickup:boundaries.append((at,pickup,True));at=pickup
    while at<end:
        boundaries.append((at,at+bar_length,False));at+=bar_length
        if len(boundaries)>256:raise ValueError('一次最多输出 256 小节。')
    score=ET.Element('score-partwise',version='4.0');work=add(score,'work');add(work,'work-title',str(settings.get('title','Bass draft'))[:200])
    parts=add(score,'part-list');part_def=add(parts,'score-part',id='P1');add(part_def,'part-name','Bass');add(part_def,'part-abbreviation','B.')
    instrument=add(part_def,'score-instrument',id='I1');add(instrument,'instrument-name','Piano')
    midi=add(part_def,'midi-instrument',id='I1');add(midi,'midi-channel',1);add(midi,'midi-program',1)
    part=add(score,'part',id='P1')
    # Global segments include explicit gaps so rests are never silently filled.
    segments=[];cursor=Fraction(0)
    for n in notes:
        if n['start']>cursor:segments.append((cursor,n['start'],None,None))
        segments.append((n['start'],n['end'],n['pitch'],n));cursor=n['end']
    if cursor<boundaries[-1][1]:segments.append((cursor,boundaries[-1][1],None,None))
    for i,(begin,finish,implicit) in enumerate(boundaries):
        measure=add(part,'measure',number=str(0 if implicit else i if pickup else i+1))
        if implicit:measure.set('implicit','yes')
        if i==0:
            attributes=add(measure,'attributes');add(attributes,'divisions',DIVISIONS);key=add(attributes,'key');add(key,'fifths',fifths)
            time=add(attributes,'time');add(time,'beats',beats);add(time,'beat-type',denominator)
            clef=add(attributes,'clef');add(clef,'sign','F');add(clef,'line',4)
            direction=add(measure,'direction',placement='above');metronome=add(add(direction,'direction-type'),'metronome')
            add(metronome,'beat-unit','quarter')
            if unit=='dotted-quarter':add(metronome,'beat-unit-dot')
            add(metronome,'per-minute',bpm);add(direction,'sound',tempo=str(bpm*(1.5 if unit=='dotted-quarter' else 1)))
        for start,stop,pitch,original in segments:
            lo=max(begin,start);hi=min(finish,stop)
            if hi<=lo:continue
            pos=lo
            for length,name,dots in split_duration(hi-lo):
                node=add(measure,'note')
                if pitch is None:add(node,'rest')
                else:
                    p=add(node,'pitch');step,alter,octave=spell(pitch,fifths);add(p,'step',step)
                    if alter:add(p,'alter',alter)
                    add(p,'octave',octave)
                add(node,'duration',int(length*DIVISIONS));add(node,'voice',1);add(node,'type',name)
                for _ in range(dots):add(node,'dot')
                if pitch is not None:
                    before=pos>original['start'];after=pos+length<original['end']
                    if before:add(node,'tie',type='stop')
                    if after:add(node,'tie',type='start')
                    if before or after:
                        notation=add(node,'notations')
                        if before:add(notation,'tied',type='stop')
                        if after:add(notation,'tied',type='start')
                pos+=length
        if i==len(boundaries)-1:add(add(measure,'barline',location='right'),'bar-style','light-heavy')
    ET.indent(score)
    xml=ET.tostring(score,encoding='utf-8',xml_declaration=True)
    return xml,{'measures':len(boundaries),'notes':len(notes),'pickup':float(pickup),'warnings':warnings}
