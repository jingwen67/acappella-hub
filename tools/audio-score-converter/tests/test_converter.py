import sys,unittest,csv,io,tempfile,threading,json,urllib.request,urllib.error
from pathlib import Path
from unittest.mock import patch
from fractions import Fraction
from xml.etree import ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from converter import convert,convert_duet,parse_csv,DIVISIONS,spell
from app import Handler,ThreadingHTTPServer
from audio_pipeline import monophonic_notes

class ConverterTests(unittest.TestCase):
    def check(self,rows,settings):
        blob,summary=convert(rows,settings);root=ET.fromstring(blob)
        beats,denominator=map(int,settings.get('meter','4/4').split('/'));full=beats*4/denominator*DIVISIONS
        for m in root.findall('./part/measure'):
            duration=sum(int(n.findtext('duration')) for n in m.findall('note'))
            self.assertEqual(duration,summary['pickup']*DIVISIONS if m.get('implicit')=='yes' else full)
        decoded=[]
        for p in root.findall('.//pitch'):
            step=p.findtext('step');alter=int(p.findtext('alter','0'));octave=int(p.findtext('octave'))
            decoded.append((octave+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[step]+alter)
        return root,summary,decoded
    def test_clean_half_bars(self):
        rows=[{'start':.395+i*1.486,'pitch':[45,40,42,49,47,40,45][i%7]} for i in range(15)]
        root,s,p=self.check(rows,{'bpm':80.75,'first_beat':.395,'grid':'strong','meter':'4/4','fifths':3})
        self.assertEqual(s['notes'],15);self.assertEqual(s['measures'],8);self.assertEqual(p,[r['pitch'] for r in rows]);self.assertEqual(root.findtext('.//clef/sign'),'F')
        self.assertEqual(root.findtext('.//midi-program'),'1')
    def test_cross_bar_ties(self):
        root,s,p=self.check([{'start':0,'end':3.5,'pitch':45}],{'bpm':120,'first_beat':0,'grid':'quarter','meter':'4/4'})
        self.assertEqual(s['measures'],2);self.assertTrue(root.findall('.//tie[@type="start"]'));self.assertTrue(root.findall('.//tie[@type="stop"]'))
    def test_pickup_and_rests(self):
        root,s,p=self.check([{'start':0,'end':.5,'pitch':45},{'start':1,'pitch':None},{'start':2,'pitch':40}],{'bpm':120,'first_beat':1,'grid':'quarter','meter':'4/4'})
        self.assertEqual(s['pickup'],2);self.assertTrue(root.findall('.//rest'));self.assertEqual(root.find('./part/measure').get('implicit'),'yes')
    def test_compound_meter(self):
        root,s,p=self.check([{'start':0,'pitch':45},{'start':.75,'pitch':40}],{'bpm':80,'beat_unit':'dotted-quarter','first_beat':0,'grid':'strong','meter':'6/8'})
        self.assertEqual(s['measures'],1);self.assertTrue(root.findall('.//beat-unit-dot'));self.assertEqual(root.find('.//sound').get('tempo'),'120.0')
    def test_csv_unicode_and_invalid(self):
        rows=parse_csv('\ufeffclip_time_seconds,midi_pitch\n0.395,45\n1.8,40\n');self.assertEqual(rows[0]['pitch'],45)
        for text in ['clip_time_seconds,midi_pitch\nNaN,45\n','clip_time_seconds,midi_pitch\n0,128\n','wrong,pitch\n0,45\n']:
            with self.assertRaises(ValueError):parse_csv(text)
        with self.assertRaises(ValueError):convert(rows,{'bpm':0})
        with self.assertRaises(ValueError):convert(rows,{'bpm':80,'first_beat':20})
    def test_pitch_roundtrip(self):
        for fifths in range(-7,8):
            for p in range(128):
                step,alt,oct=spell(p,fifths);self.assertEqual((oct+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[step]+alt,p)
    def test_collisions_and_title_escape(self):
        root,s,p=self.check([{'start':0,'pitch':45},{'start':.01,'pitch':40}],{'bpm':80,'first_beat':0,'title':'A < B & C'})
        self.assertEqual(s['notes'],1);self.assertTrue(s['warnings']);self.assertEqual(root.findtext('./work/work-title'),'A < B & C')
    def test_duet_alignment(self):
        solo=[{'start':0,'end':1.2,'pitch':64},{'start':1.5,'end':5,'pitch':67}]
        bass=[{'start':.5,'pitch':45},{'start':2,'pitch':40}]
        blob,summary=convert_duet(solo,bass,{'title':'Duet','bpm':120,'first_beat':.5,'meter':'4/4','fifths':3})
        root=ET.fromstring(blob);parts=root.findall('part');self.assertEqual(len(parts),2)
        self.assertEqual([p.get('id') for p in parts],['P1','P2'])
        measures=[p.findall('measure') for p in parts];self.assertEqual(len(measures[0]),len(measures[1]))
        for a,b in zip(*measures):
            self.assertEqual(sum(int(n.findtext('duration')) for n in a.findall('note')),sum(int(n.findtext('duration')) for n in b.findall('note')))
        self.assertEqual([p.findtext('.//clef/sign') for p in parts],['G','F'])
        self.assertEqual([p.findtext('part-name') for p in root.findall('./part-list/score-part')],['Solo','Bass'])
    def test_voice_selection_preserves_onsets_and_rests(self):
        candidates=[{'id':0,'start':0,'end':.5,'pitch':64,'strength':.8},
                    {'id':1,'start':0,'end':.5,'pitch':76,'strength':.2},
                    {'id':2,'start':.5,'end':1,'pitch':64,'strength':.7},
                    {'id':3,'start':1.5,'end':2.5,'pitch':67,'strength':.8}]
        notes=monophonic_notes(candidates,2)
        self.assertEqual([n['pitch'] for n in notes],[64,64,67])
        self.assertEqual(notes[0]['end'],.5);self.assertEqual(notes[1]['start'],.5)
        self.assertEqual(notes[2]['start'],1.5);self.assertEqual(notes[2]['end'],2)
    def test_local_api(self):
        with tempfile.TemporaryDirectory() as tmp:
            server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.token='test-token';server.files={};server.output=Path(tmp);server.uploads={};server.jobs={};server.job_lock=threading.Lock();server.active=False
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{server.server_port}'
            def post(route,data,token='test-token'):
                request=urllib.request.Request(base+route,json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Local-Token':token,'Origin':base})
                with urllib.request.urlopen(request) as r:return json.load(r)
            try:
                page=urllib.request.urlopen(base).read().decode();self.assertIn('test-token',page)
                rows=post('/parse',{'csv':'clip_time_seconds,midi_pitch\n0,45\n1.5,40\n'})['rows']
                result=post('/convert',{'rows':rows,'settings':{'bpm':80,'first_beat':0}})
                ET.fromstring(urllib.request.urlopen(base+'/download/'+result['id']).read())
                self.assertTrue(Path(result['path']).is_file())
                fake={'solo':[{'start':0,'end':1,'pitch':64}],'bass':[{'start':0,'end':None,'pitch':45}],'bpm':80,'first_beat':0,'duration':2}
                request=urllib.request.Request(base+'/upload',b'example-audio',headers={'X-Local-Token':'test-token','Origin':base,'Content-Type':'application/octet-stream'})
                uploaded=json.load(urllib.request.urlopen(request));self.assertEqual((server.uploads[uploaded['id']]/'input.bin').read_bytes(),b'example-audio')
                def fake_process(arguments,**kwargs):
                    work=Path(arguments[3]);work.mkdir(parents=True);(work/'analysis.json').write_text(json.dumps(fake))
                    class Process:
                        stdout=io.StringIO('PROGRESS '+json.dumps({'text':'test processing'})+'\n')
                        def wait(self):return 0
                    return Process()
                with patch('app.subprocess.Popen',side_effect=fake_process):
                    job=post('/analyze',{'id':uploaded['id'],'start':0,'end':2})
                    import time
                    for _ in range(100):
                        state=json.load(urllib.request.urlopen(base+'/job/'+job['id']))
                        if state['status']!='running':break
                        time.sleep(.01)
                    self.assertEqual(state['status'],'done');self.assertEqual(state['result']['solo'][0]['pitch'],64)
                both=post('/convert-audio',dict(fake,settings={'bpm':80,'first_beat':0,'meter':'4/4'}))
                self.assertEqual(len(ET.fromstring(urllib.request.urlopen(base+'/download/'+both['id']).read()).findall('part')),2)
                with self.assertRaises(urllib.error.HTTPError):post('/analyze',{'id':uploaded['id'],'start':0,'end':61})
                with patch('app.sys.platform','darwin'),patch('app.subprocess.run') as opened:
                    response=post('/open',{'id':result['id'],'app':'/Applications/MuseScore 4.app'})
                    self.assertIn('MuseScore',response['message'])
                    self.assertEqual(opened.call_args.args[0],['open','-a','/Applications/MuseScore 4.app',result['path']])
                with self.assertRaises(urllib.error.HTTPError):post('/convert',{'rows':rows,'settings':{}},token='wrong')
                if sys.platform!='darwin':
                    with self.assertRaises(urllib.error.HTTPError):post('/open',{'id':result['id']})
            finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
