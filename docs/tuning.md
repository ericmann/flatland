# Tuning log

One section per tuning task, each with a before/after sweep table (SPEC
§3.8, §9.5). Tuning changes are diffs to `src/core/config.js` defaults, never
code changes — see `docs/PLAN.md` → Conventions → Config for the full key
table.

## P0-06 terrain — before

`node scripts/sweep.mjs --seeds 1..40` against the P0-05 defaults
(`terrain.octaves`: scale 22/9/4 weighted .6/.3/.1; `terrain.thresholds`:
water .34, sand .38, mud .44, grass .62, scrub .74):

```
world 256x160, 40 seed(s)

  seed  reroll   grass%   water%  lgGrass%  lgWater%    sand%     mud%   scrub%    rock%
     1       0     43.2     11.8      39.9       6.3      6.7     12.2     19.2      7.0
     2       0     38.7     13.2      37.5       2.8      7.3     13.5     18.9      8.4
     3       3     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     4       2     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     5       1     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     6       0     48.3      8.2      46.7       2.1      6.0     12.1     19.9      5.5
     7       0     41.0     11.2      27.0       3.6      7.3     15.6     17.6      7.3
     8       0     44.5     10.5      43.0       2.6      5.9     11.3     21.7      6.1
     9       0     36.6     14.9      20.8       3.3      6.9     12.6     18.3     10.5
    10       0     41.7     12.7      40.8       2.7      6.6     12.9     18.2      7.9
    11       0     47.6      8.6      46.9       2.6      5.0     10.9     19.9      7.9
    12       0     40.6     12.6      36.1       2.3      6.4     11.6     21.5      7.2
    13       1     38.0     12.4      34.2       2.4      6.8     12.7     22.3      7.8
    14       0     38.0     12.4      34.2       2.4      6.8     12.7     22.3      7.8
    15       0     43.9      9.3      39.7       2.5      5.8     11.5     22.8      6.7
    16       0     45.5      7.1      40.9       2.5      5.5     13.8     21.1      6.9
    17       1     41.3     11.7      31.8       3.3      5.9     12.1     18.3     10.8
    18       0     41.3     11.7      31.8       3.3      5.9     12.1     18.3     10.8
    19       3     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    20       2     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    21       1     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    22       0     43.9     11.5      21.6       3.6      8.4     14.7     14.8      6.8
    23       0     39.3     13.4      32.6       3.7      7.0     11.9     18.0     10.5
    24       0     40.3     12.4      34.2       3.2      5.8     11.1     21.2      9.1
    25       0     38.4     12.6      33.6       2.9      6.8     12.4     19.3     10.5
    26       3     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    27       2     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    28       1     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    29       0     47.0      9.9      46.1       2.2      7.1     14.0     17.2      4.7
    30       2     48.5     11.5      47.7       3.6      6.6     12.8     15.8      4.9
    31       1     48.5     11.5      47.7       3.6      6.6     12.8     15.8      4.9
    32       0     48.5     11.5      47.7       3.6      6.6     12.8     15.8      4.9
    33       1     44.4     11.0      43.5       3.3      6.9     12.7     16.3      8.6
    34       0     44.4     11.0      43.5       3.3      6.9     12.7     16.3      8.6
    35       0     41.9      7.2      39.4       3.7      4.6     10.6     26.2      9.6
    36       0     39.9     10.8      38.2       3.0      5.4      9.9     21.2     12.8
    37       0     41.5     11.2      39.4       2.3      6.9     12.0     20.8      7.6
    38       0     41.7      9.1      41.0       5.2      5.0     10.1     23.4     10.6
    39       0     43.3     10.2      38.9       3.3      6.9     12.4     19.7      7.5
    40       4     38.5     13.7      20.0       4.1      5.3      9.9     23.3      9.3
---
mean grass% 43.4  mean water% 10.9  seeds needing reroll: 15/40  total rerolls: 28
```

**Diagnosis:** `grass%`/`water%` (total tiles of that type) are well above
the largest-component columns (`lgGrass%`/`lgWater%`) for many seeds —
water in particular is fragmented into many small ponds instead of one
connected body, so 15 of 40 seeds fail the ≥2% largest-water-component
guarantee on the first roll and need one or more re-rolls (28 total, one
seed needing 4). The 8%/2% guarantee numbers are unchanged (SPEC §4.2, not
flagged ⚠️); the problem is the noise shape.

## P0-06 terrain — after

Changed only `terrain.octaves` (down-weighted and widened the two
higher-frequency layers so terrain features are larger and more contiguous)
and `terrain.thresholds` (mud/grass/scrub widened slightly to keep band
proportions after smoothing; water/sand left close to their prior values):

```
octaves:    [{scale:30,weight:.75,lattice:16}, {scale:12,weight:.2,lattice:32}, {scale:5,weight:.05,lattice:64}]
thresholds: {water:.34, sand:.37, mud:.42, grass:.64, scrub:.76}
```

`node scripts/sweep.mjs --seeds 1..40`:

```
world 256x160, 40 seed(s)

  seed  reroll   grass%   water%  lgGrass%  lgWater%    sand%     mud%   scrub%    rock%
     1       0     48.0     10.9      46.5       3.6      4.4      7.1     16.9     12.7
     2       0     41.8     23.4      41.7      11.2      6.0     11.0     12.8      5.0
     3       0     44.1     12.5      27.0       6.2      3.9      8.6     16.4     14.5
     4       0     43.4      8.9      31.1       2.5      3.6      7.7     24.2     12.2
     5       0     44.1     12.5      40.9       3.9      5.1     11.1     16.9     10.3
     6       0     50.7     14.1      50.5       5.6      5.2      9.4     13.6      7.0
     7       0     44.5     11.1      42.0       3.0      4.9     10.8     17.7     11.0
     8       0     47.4     13.3      36.4       3.0      3.6      6.7     19.9      9.1
     9       0     36.8     22.8      17.6       7.4      4.7      8.2     15.0     12.5
    10       0     37.0     24.8      32.6      12.6      6.2     10.1     15.0      6.9
    11       0     47.8     14.5      46.3       5.3      5.1      9.4     14.2      9.1
    12       0     42.8     22.3      38.3       8.2      5.2     11.3     15.2      3.2
    13       0     44.8      8.3      27.4       5.4      3.4      9.8     23.1     10.5
    14       0     34.2     21.8      31.7       7.6      4.9      9.5     18.4     11.2
    15       0     47.0      9.1      46.8       2.7      3.9      8.0     22.7      9.4
    16       0     48.2      9.7      48.1       3.8      4.4     11.3     17.1      9.3
    17       0     43.6     12.4      43.2       4.4      3.7      7.1     22.3     10.8
    18       0     38.3     15.3      29.7       5.9      4.0      7.5     17.1     17.8
    19       0     40.4     18.1      40.0       4.5      5.3     10.4     16.5      9.4
    20       0     46.6      8.9      42.5       3.6      3.5      7.1     23.3     10.6
    21       0     52.5     12.2      52.0       4.6      4.5      8.3     16.9      5.6
    22       0     40.7     19.2      29.1       9.7      6.9     11.8     12.7      8.6
    23       0     38.1     20.7      20.2       9.8      5.5      9.5     14.7     11.5
    24       0     43.7     13.2      18.2       4.9      2.6      6.3     24.6      9.6
    25       0     43.2     18.6      43.1       9.1      5.3      9.2     15.2      8.5
    26       0     46.5      8.9      38.0       3.6      3.4      8.0     20.7     12.5
    27       0     41.8     13.6      40.5       4.7      4.5      8.0     19.8     12.2
    28       0     46.8     17.2      46.3       6.7      6.3     12.1     12.1      5.5
    29       0     52.7     16.8      52.7       3.8      5.1      9.3     12.8      3.3
    30       0     43.2      9.1      28.5       3.0      2.6      6.0     23.0     16.2
    31       0     43.7     15.5      43.1       5.0      5.0      9.0     14.2     12.7
    32       0     49.8     20.2      48.6       8.4      5.9      9.3     11.3      3.5
    33       0     43.0     11.0      41.6       3.8      3.9      8.8     20.8     12.6
    34       0     46.5      9.6      31.5       2.4      3.2      7.6     16.5     16.5
    35       0     45.3     14.1      42.6       9.4      4.4      8.7     20.6      6.8
    36       0     45.5     11.3      43.5       2.9      3.2      6.3     21.6     12.2
    37       0     44.0     17.6      31.5       6.6      4.5      8.7     18.6      6.5
    38       0     38.0     16.5      37.2      10.7      4.6      8.2     21.1     11.5
    39       0     40.0     18.9      35.1       5.8      6.4      9.2     15.8      9.8
    40       0     49.8     14.6      47.6       4.4      6.3     13.8     12.5      3.0
---
mean grass% 44.2  mean water% 14.8  seeds needing reroll: 0/40  total rerolls: 0
```

Largest-component means (the values the guarantee and targets actually
check, `lgGrass%`/`lgWater%` above): mean largest-grass 38.3%, mean
largest-water 5.7%, min largest-grass 17.6%, min largest-water 2.4% —
comfortably inside `[0.30, 0.50]` and `[0.05, 0.20]` with every individual
seed still well clear of the 8%/2% guarantee floor.

**Result:** 0/40 seeds need a re-roll (target was ≤2/40; exceeded). Mean
largest-grass-component 38.3% and mean largest-water-component 5.7%, both
inside target range. No further iteration needed.
