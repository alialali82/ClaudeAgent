"""Write subtitles from the same cues the page draws: voice start times (events.json) + the line text and length."""
import json, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__)); LIB = os.environ.get('LIB', '/root/lemo-opuscar')
lines = {l['id']: l['text'] for l in json.load(open(os.path.join(HERE, 'lines.json')))}
dur = json.load(open(os.path.join(HERE, 'out/voice/dur.json')))
ev = [e for e in json.load(open(os.path.join(HERE, 'events.json')))['ev'] if e['type'] == 'voice']
cues = [{'t0': e['t'], 't1': round(e['t'] + max(1.8, dur[e['id']] + .6), 3), 'text': lines[e['id']]} for e in ev]
json.dump(cues, open(os.path.join(HERE, 'out/subs.json'), 'w'))
subprocess.check_call([os.path.join(LIB, '.venv/bin/python'), os.path.join(LIB, 'core/render/srt.py'), os.path.join(HERE, 'out/subs.json'), os.path.join(HERE, 'little-bear-and-the-unfinished-dark.srt')])
