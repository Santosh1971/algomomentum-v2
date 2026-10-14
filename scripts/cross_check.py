import json
import pandas as pd
import pandas_ta as ta
import numpy as np

with open("backtest-data/xrpusd_30m.json") as f:
    raw = json.load(f)
candles = raw["candles"][:500]
df = pd.DataFrame(candles)

with open("backtest-data/ts_indicators_check.json") as f:
    ts_out = json.load(f)
ts_df = pd.DataFrame(ts_out)

# --- SuperTrend cross-check via pandas_ta (independent implementation) ---
st = ta.supertrend(high=df["high"], low=df["low"], close=df["close"], length=15, multiplier=3)
# pandas_ta supertrend columns: SUPERT_15_3.0 (the line), SUPERTd_15_3.0 (1 = up/bull, -1 = down/bear — NOTE opposite sign convention from Pine!)
line_col = [c for c in st.columns if c.startswith("SUPERT_")][0]
dir_col = [c for c in st.columns if c.startswith("SUPERTd_")][0]

pta_line = st[line_col].values
pta_dir = st[dir_col].values  # pandas_ta: 1 = uptrend, -1 = downtrend (OPPOSITE sign to Pine's direction<0=up)

ts_line = ts_df["st"].values
ts_dir = ts_df["direction"].values  # Pine convention: -1 = uptrend, 1 = downtrend

# Compare direction with sign flipped to match conventions, skipping warmup NaNs
mismatches = 0
compared = 0
max_line_diff = 0.0
for i in range(len(df)):
    if np.isnan(pta_line[i]) or np.isnan(ts_line[i]):
        continue
    compared += 1
    # pandas_ta dir=1 (up) should correspond to Pine direction=-1 (up)
    expected_pine_dir = -1 if pta_dir[i] == 1 else 1
    if expected_pine_dir != ts_dir[i]:
        mismatches += 1
        if mismatches <= 5:
            print(f"DIR MISMATCH at i={i} time={df['time'][i]}: pandas_ta_dir={pta_dir[i]} ts_dir={ts_dir[i]}")
    diff = abs(pta_line[i] - ts_line[i])
    if diff > max_line_diff:
        max_line_diff = diff

print(f"\nSuperTrend: compared {compared} bars, {mismatches} direction mismatches, max line value diff = {max_line_diff:.6f}")

# --- T3 cross-check via manual pandas EMA cascade (same formula, independent code path) ---
def t3_manual(close, length, b=0.7):
    e1 = close.ewm(span=length, adjust=False).mean()
    e2 = e1.ewm(span=length, adjust=False).mean()
    e3 = e2.ewm(span=length, adjust=False).mean()
    e4 = e3.ewm(span=length, adjust=False).mean()
    e5 = e4.ewm(span=length, adjust=False).mean()
    e6 = e5.ewm(span=length, adjust=False).mean()
    c1 = -b**3
    c2 = 3*b**2 + 3*b**3
    c3 = -6*b**2 - 3*b - 3*b**3
    c4 = 1 + 3*b + b**3 + 3*b**2
    return c1*e6 + c2*e5 + c3*e4 + c4*e3

t3_fast_py = t3_manual(df["close"], 4)
t3_slow_py = t3_manual(df["close"], 7)

max_fast_diff = (t3_fast_py.values - ts_df["t3Fast"].values)
max_slow_diff = (t3_slow_py.values - ts_df["t3Slow"].values)
print(f"T3 fast(4): max abs diff = {np.nanmax(np.abs(max_fast_diff)):.8f}")
print(f"T3 slow(7): max abs diff = {np.nanmax(np.abs(max_slow_diff)):.8f}")

# Show a few rows side by side for a sanity read
print("\nSample rows (idx, ts_t3Fast, py_t3Fast, ts_t3Slow, py_t3Slow):")
for i in [50, 100, 200, 400, 499]:
    print(i, ts_df["t3Fast"][i], t3_fast_py.values[i], ts_df["t3Slow"][i], t3_slow_py.values[i])
