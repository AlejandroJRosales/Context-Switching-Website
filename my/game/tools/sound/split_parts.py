# split_parts.py: cut the two recordings into labeled parts and draw spectrograms with the cuts.
# Boundaries come from the loudness/pitch analysis; each cut snaps to the quietest 10 ms frame
# within +-SNAP_MS so it lands in a gap, not on a transient.
import json
import numpy as np, warnings; warnings.filterwarnings('ignore')
from scipy.io import wavfile
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt

SNAP_MS = 40
FADE_MS = 5
PARTS = {
    'steps': [('A_mid-low', 0.00), ('B_bright', 0.745), ('C_single-bright', 1.60), ('D_low-thuds', 1.90)],
    'car':   [('0_lead-in', 0.00), ('1_start', 0.70), ('2_idle', 2.90), ('3_rev-short', 9.60), ('4_idle', 10.50),
              ('5_rev-long', 11.60), ('6_idle', 13.60), ('7_ending', 15.30)],
}

def snap(x, sr, t):
    if t == 0: return 0
    h = int(sr * 0.01); c = int(t * sr); r = int(sr * SNAP_MS / 1000)
    best, bi = 1e9, c
    for i in range(max(0, c - r), min(len(x) - h, c + r), h // 2):
        e = np.mean(x[i:i + h] ** 2)
        if e < best: best, bi = e, i + h // 2
    return bi

summary = {}
for name, parts in PARTS.items():
    sr, x = wavfile.read(f'{name}.wav'); xf = x.astype(float) / 32768
    cuts = [snap(xf, sr, t) for _, t in parts] + [len(xf)]
    summary[name] = []
    fade = int(sr * FADE_MS / 1000); ramp = np.linspace(0, 1, fade)
    for (label, _), a, b in zip(parts, cuts[:-1], cuts[1:]):
        seg = xf[a:b].copy()
        if a > 0: seg[:fade] *= ramp
        if b < len(xf): seg[-fade:] *= ramp[::-1]
        fn = f'parts/{name}_{label}.wav'
        wavfile.write(fn, sr, (seg * 32767).astype(np.int16))
        summary[name].append({'file': fn, 'startSec': round(a / sr, 3), 'endSec': round(b / sr, 3)})
    fig, ax = plt.subplots(figsize=(14 if name == 'car' else 10, 4.2), dpi=110)
    ax.specgram(xf, NFFT=1024 if name == 'car' else 512, Fs=sr, noverlap=768 if name == 'car' else 448, cmap='magma', vmin=-130)
    ax.set_yscale('symlog', linthresh=500); ax.set_ylim(40, sr / 2)
    for (label, _), a, b in zip(parts, cuts[:-1], cuts[1:]):
        ax.axvline(a / sr, color='cyan', lw=1.2)
        ax.text((a + b) / 2 / sr, sr / 2 * 0.6, label, color='cyan', ha='center', va='top', fontsize=9, rotation=90 if name == 'car' and (b - a) / sr < 1.2 else 0)
    ax.set_xlabel('seconds'); ax.set_ylabel('Hz'); ax.set_title(f'{name}: spectrogram with cut points')
    fig.tight_layout(); fig.savefig(f'parts/{name}-cuts.png'); plt.close(fig)
json.dump(summary, open('parts/cuts.json', 'w'), indent=1)
print(json.dumps(summary, indent=1))
