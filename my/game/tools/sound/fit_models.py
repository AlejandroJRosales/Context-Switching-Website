# fit_models.py
# Fits every recorded sound to a compact model that sounds.js plays with Web Audio
# nodes only (no samples ship). Writes the fitted numbers into the "models" block of
# sounds.json and leaves every other block untouched.
#
# Two model kinds:
#   bandModel  (one-shots: gunshot, footstep, car start, car shutdown)
#       shared noise -> band-pass bank -> per-band gain ramped linearly through breakpoints.
#       A short-time Fourier magnitude model: band loudness over time is kept, phase is noise.
#   engineLoop (car idle, and revs by raising the firing rate)
#       harmonic series at the firing rate (one OscillatorNode with a PeriodicWave)
#       + steady noise bands, pulsed at the firing rate by the measured depth
#       + slow random wander of the firing rate (measured from the idle).
#       Loudness vs firing rate is fitted from the long rev.
#
# Usage: python3 -I fit_models.py <parts dir> <glock wav> <sounds.json>
import json, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter, resample_poly, welch, butter, sosfiltfilt, hilbert, freqz

MODEL_SR = 48000          # fit rate; browsers run 44.1 or 48 kHz and biquads are set in Hz
LEVEL_PEAK = 0.8          # each source file is scaled so its loudest sample is this; parts of one file share the scale
# Full recording each part was cut from, so all parts of one file keep their relative levels.
GROUP_FILES = {'GLOCK': None, 'steps': 'steps.wav', 'car': 'car.wav'}
ONSET_DB = -30            # 'detect' onset: first sample within this many dB of the peak
FIT_ITERATIONS = 6
RENDERS_PER_ITERATION = 3


def grid(stop_ms, step_ms):
    return [float(t) for t in np.arange(0, stop_ms + 1e-9, step_ms)]


# One table for every one-shot: source part, onset rule, band layout, breakpoint times.
BAND_MODEL_SPECS = {
    'gunshot': dict(src='GLOCK', group='GLOCK', onset='detect', bands=(100, 16000, 24),
                    breakpointsMs=[0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 40, 50, 60,
                                   70, 80, 100, 120, 150, 200, 250, 300, 400, 500, 700, 900, 1200]),
    'footstepWalk': dict(src='steps_C_single-bright.wav', group='steps', onset='detect', bands=(100, 16000, 24),
                         breakpointsMs=[0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 30, 40, 50, 60, 70, 85,
                                        100, 120, 140, 160, 190, 220, 250]),
    'carStart': dict(src='car_1_start.wav', group='car', onset='start', bands=(30, 10000, 32), breakpointsMs=grid(2190, 30)),
    'carShutdown': dict(src='car_7_ending.wav', group='car', onset='start', bands=(30, 10000, 32), breakpointsMs=grid(2200, 50)),
}
ENGINE_SPEC = dict(group='car', idle='car_2_idle.wav', rev='car_5_rev-long.wav', bands=(30, 10000, 32),
                   idleHzSearch=(45, 56), maxHarmonicHz=2000, revFrameMs=50)


# ---------------------------------------------------------------- shared helpers
def group_scale(base_dir, group, glock_path):
    path = glock_path if GROUP_FILES[group] is None else f'{base_dir}/{GROUP_FILES[group]}'
    sr, x = wavfile.read(path)
    x = x.astype(np.float64); x = x.mean(axis=1) if x.ndim > 1 else x
    return LEVEL_PEAK / (np.abs(x).max() / (32768.0 if np.abs(x).max() > 1.5 else 1.0))


def load(path):
    sr, x = wavfile.read(path)
    x = x.astype(np.float64)
    if x.ndim > 1:
        x = x.mean(axis=1)
    if np.abs(x).max() > 1.5:
        x /= 32768.0
    g = np.gcd(sr, MODEL_SR)
    return resample_poly(x, MODEL_SR // g, sr // g)


def band_layout(lo, hi, count):
    centers = np.geomspace(lo, hi, count)
    r = (hi / lo) ** (1 / (count - 1))
    q = 1 / (np.sqrt(r) - 1 / np.sqrt(r))   # adjacent bands meet near their -3 dB points
    return centers, q


def rbj_bandpass(f0, q):
    # Web Audio spec "bandpass" (constant 0 dB peak gain).
    w0 = 2 * np.pi * f0 / MODEL_SR
    alpha = np.sin(w0) / (2 * q)
    b = np.array([alpha, 0, -alpha]); a = np.array([1 + alpha, -2 * np.cos(w0), 1 - alpha])
    return b / a[0], a / a[0]


def windows_for(bp_ms, n):
    t = np.array(bp_ms) / 1000 * MODEL_SR
    edges = np.concatenate([[t[0]], (t[:-1] + t[1:]) / 2, [t[-1] + (t[-1] - t[-2]) / 2]])
    edges = np.clip(edges.astype(int), 0, n)
    edges[1] = max(edges[1], edges[0] + 8)
    return list(zip(edges[:-1], edges[1:]))


def band_rms(x, filters, windows):
    out = np.zeros((len(filters), len(windows)))
    for i, (b, a) in enumerate(filters):
        y = lfilter(b, a, x)
        for j, (lo, hi) in enumerate(windows):
            out[i, j] = np.sqrt(np.mean(y[lo:hi] ** 2)) if hi > lo else 0
    return out


def iterate_gains(target, gains, render, measure, label):
    # Render, measure through the analysis bank, scale gains by target/measured. New noise every pass.
    loud = target > target.max() * 1e-3
    for it in range(FIT_ITERATIONS):
        meas = np.mean([measure(render(gains)) for _ in range(RENDERS_PER_ITERATION)], axis=0)
        err = 20 * np.log10(np.maximum(meas, 1e-9) / np.maximum(target, 1e-9))
        gains = gains * np.clip(target / np.maximum(meas, 1e-12), 0.25, 4)
    print(f'{label}: band error after fit {np.sqrt(np.mean(err[loud] ** 2)):.2f} dB rms over loud cells')
    return gains


# ---------------------------------------------------------------- one-shot band models
def render_band_model(gains, filters, bp_ms, n, rng):
    t = np.arange(n) / MODEL_SR * 1000
    noise = rng.uniform(-1, 1, n)
    out = np.zeros(n)
    for i, (b, a) in enumerate(filters):
        out += lfilter(b, a, noise) * np.interp(t, bp_ms, gains[i], right=0)
    return out


def fit_band_model(name, spec, parts_dir, glock_path, rng):
    x = load(glock_path if spec['src'] == 'GLOCK' else f'{parts_dir}/{spec["src"]}')
    x *= group_scale(f'{parts_dir}/..', spec['group'], glock_path)
    start = 0
    if spec['onset'] == 'detect':
        start = int(np.argmax(np.abs(x) > np.abs(x).max() * 10 ** (ONSET_DB / 20)))
    bp = spec['breakpointsMs']
    n = int((bp[-1] + 50) / 1000 * MODEL_SR)
    target = np.zeros(n); seg = x[start:start + n]; target[:len(seg)] = seg
    centers, q = band_layout(*spec['bands'])
    filters = [rbj_bandpass(f, q) for f in centers]
    windows = windows_for(bp, n)
    env = band_rms(target, filters, windows)
    gains = iterate_gains(env, env / 0.17,
                          lambda g: render_band_model(g, filters, bp, n, rng),
                          lambda y: band_rms(y, filters, windows), name)
    return target, {
        'kind': 'bandModel', 'source': 'GLOCK' if spec['src'] == 'GLOCK' else spec['src'],
        'bandQ': round(float(q), 4), 'bandHz': [round(float(f), 2) for f in centers],
        'breakpointsMs': bp, 'gains': [[float(f'{g:.4g}') for g in row] for row in gains],
    }


# ---------------------------------------------------------------- engine loop
def firing_track(x, lo_hz, hi_hz, frame_ms):
    # Firing rate per frame from autocorrelation of the 20-400 Hz band; lag limited to [1/hi, 1/lo].
    lp = sosfiltfilt(butter(4, [20, 400], 'bandpass', fs=MODEL_SR, output='sos'), x)
    W = int(0.2 * MODEL_SR); hop = int(frame_ms / 1000 * MODEL_SR)
    rates, levels = [], []
    for i in range(0, len(x) - W, hop):
        s = lp[i:i + W] - lp[i:i + W].mean()
        ac = np.correlate(s, s, 'full')[W - 1:]; ac /= ac[0] + 1e-12
        a, b = int(MODEL_SR / hi_hz), int(MODEL_SR / lo_hz)
        k = a + np.argmax(ac[a:b])
        rates.append(MODEL_SR / k)
        levels.append(20 * np.log10(np.sqrt(np.mean(x[i:i + W] ** 2)) + 1e-12))
    return np.array(rates), np.array(levels)


def fit_engine(spec, parts_dir, rng):
    scale = group_scale(f'{parts_dir}/..', spec['group'], None)
    idle = load(f'{parts_dir}/{spec["idle"]}') * scale
    rev = load(f'{parts_dir}/{spec["rev"]}') * scale

    # Firing rate: peak of a 0.25 Hz-resolution PSD near idleHzSearch, refined by parabolic interpolation.
    fh, Ph = welch(idle, MODEL_SR, nperseg=4 * MODEL_SR, noverlap=3 * MODEL_SR)
    dfh = fh[1] - fh[0]
    lo, hi = (int(v / dfh) for v in spec['idleHzSearch'])
    i = lo + np.argmax(Ph[lo:hi + 1]); y0, y1, y2 = np.log(Ph[i - 1:i + 2])
    idle_hz = float(fh[i] + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2) * dfh)

    # Wander: half-power width of the fundamental, minus the Hann window's own width (1.44 bins),
    # read as a Gaussian spread (width = 2.355 sigma).
    j = i
    while Ph[j] > Ph[i] / 2: j -= 1
    k = i
    while Ph[k] > Ph[i] / 2: k += 1
    width = (k - j) * dfh
    sigma_hz = np.sqrt(max(width ** 2 - (1.44 * dfh) ** 2, 0)) / 2.355
    wander_fraction = float(sigma_hz / idle_hz)

    # Harmonic amplitudes (1 Hz PSD): integrated peak above the local floor gives A^2/2.
    # The same pass builds the harmonic-free PSD the noise bands are fitted to.
    f, P = welch(idle, MODEL_SR, nperseg=MODEL_SR, noverlap=MODEL_SR // 2)
    df = f[1] - f[0]
    noise_psd = P.copy()
    amps = []
    for k in range(1, int(spec['maxHarmonicHz'] / idle_hz) + 1):
        c = int(round(k * idle_hz / df))
        peak = P[c - 3:c + 4]
        floor = np.median(np.r_[P[c - 15:c - 5], P[c + 6:c + 16]])
        amps.append(float(np.sqrt(2 * max(peak.sum() - floor * len(peak), 0) * df)))
        noise_psd[c - 3:c + 4] = np.minimum(peak, floor)

    # Pulse depth: modulation of the 1-3 kHz band envelope at the firing rate.
    b = sosfiltfilt(butter(4, [1000, 3000], 'bandpass', fs=MODEL_SR, output='sos'), idle)
    env = sosfiltfilt(butter(2, 200, fs=MODEL_SR, output='sos'), np.abs(hilbert(b)))
    fe, Pe = welch(env - env.mean(), MODEL_SR, nperseg=MODEL_SR)
    j = int(round(idle_hz))
    pulse_depth = float(np.sqrt(2 * Pe[j - 2:j + 3].sum() * (fe[1] - fe[0])) / env.mean())

    # Loudness vs firing rate from the long rev: level_dB = c + exponent * 20 log10(rate / idle).
    r_rates, r_levels = firing_track(rev, 40, 140, spec['revFrameMs'])
    ok = r_levels > r_levels.max() - 25
    xr = 20 * np.log10(r_rates[ok] / idle_hz)
    exponent = float(np.polyfit(xr, r_levels[ok], 1)[0])
    rev_max_ratio = float(r_rates[ok].max() / idle_hz)

    m = {'kind': 'engineLoop', 'source': f'{spec["idle"]} + {spec["rev"]}', 'idleHz': round(idle_hz, 3),
         'harmonicAmp': amps, 'harmonicPhase': [0.0] * len(amps), 'wanderFraction': round(wander_fraction, 4),
         'wanderHz': 3.0, 'pulseDepth': round(pulse_depth, 3), 'levelExponent': round(exponent, 3),
         'revMaxRatio': round(rev_max_ratio, 3)}

    # Noise band gains: fitted to the harmonic-free PSD, so the harmonics and the noise do not
    # both claim the energy beside each harmonic. Band power = sum PSD * |H_band|^2 for target and model.
    centers, q = band_layout(*spec['bands'])
    filters = [rbj_bandpass(fc, q) for fc in centers]
    H2 = np.array([np.abs(freqz(b_, a_, worN=f, fs=MODEL_SR)[1]) ** 2 for b_, a_ in filters])
    target = np.sqrt(H2 @ noise_psd)[:, None]
    n = 4 * MODEL_SR
    def render_noise(g):
        noise = rng.uniform(-1, 1, n)
        return sum(lfilter(b_, a_, noise) * gi for (b_, a_), gi in zip(filters, g[:, 0]))
    def measure(y):
        return np.sqrt(H2 @ welch(y, MODEL_SR, nperseg=MODEL_SR, noverlap=MODEL_SR // 2)[1])[:, None]
    gains = iterate_gains(target, target / 0.17, render_noise, measure, 'carIdle noise')
    m.update(bandQ=round(float(q), 4), bandHz=[round(float(c), 2) for c in centers],
             noiseGains=[float(f'{g:.4g}') for g in gains[:, 0]],
             harmonicAmp=[float(f'{a:.4g}') for a in amps])
    print(f'carIdle: firing {idle_hz:.2f} Hz, {len(amps)} harmonics, wander {wander_fraction*100:.1f}%, '
          f'pulse depth {pulse_depth:.2f}, level exponent {exponent:.2f}, rev max x{rev_max_ratio:.2f}')
    return idle, m


def main(parts_dir, glock_path, json_path):
    rng = np.random.default_rng(7)
    cfg = json.load(open(json_path))
    models, targets = {}, {}
    for name, spec in BAND_MODEL_SPECS.items():
        targets[name], models[name] = fit_band_model(name, spec, parts_dir, glock_path, rng)
    targets['carIdle'], models['carIdle'] = fit_engine(ENGINE_SPEC, parts_dir, rng)
    cfg['models'] = models
    with open(json_path, 'w') as fh:
        fh.write(compact_json(cfg))
    np.savez('fit-targets.npz', **targets)
    print('wrote models:', ', '.join(models))


def compact_json(obj):
    import re
    s = json.dumps(obj, indent=2)
    return re.sub(r'\[\s+([-\d.e,\s]+?)\s+\]', lambda m: '[' + ', '.join(v.strip() for v in m.group(1).split(',')) + ']', s) + '\n'


if __name__ == '__main__':
    main(*sys.argv[1:4])
