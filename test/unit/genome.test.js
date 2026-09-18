import { describe, it, expect } from 'vitest';
import { makeConfig, DOCS, flatten, DEFAULTS } from '../../src/core/config.js';
import { OrganismStore, TRAIT_COUNT } from '../../src/core/organisms.js';
import { Rng } from '../../src/core/rng.js';
import {
  TRAIT,
  TRAIT_NAMES,
  BRAIN_INPUTS,
  BRAIN_OUTPUTS,
  weightCount,
  genomeLength,
  traitValue,
  dietClass,
  visionClass,
  applyPhenotype,
  mutate,
  distance,
  distanceTo,
  MAX_TRAIT_DISTANCE,
} from '../../src/core/genome.js';

const cfg = makeConfig();

describe('genome layout', () => {
  it('TRAIT_COUNT is 24 and matches TRAIT_NAMES length', () => {
    expect(TRAIT_COUNT).toBe(24);
    expect(TRAIT_NAMES.length).toBe(24);
    expect(Object.keys(TRAIT).length).toBe(24);
  });

  it('BRAIN_INPUTS is 17 and BRAIN_OUTPUTS is 8', () => {
    expect(BRAIN_INPUTS).toBe(17);
    expect(BRAIN_OUTPUTS).toBe(8);
  });

  it('genomeLength = 24 + 17*hidden + (hidden+1)*8', () => {
    const hidden = cfg.brain.hidden;
    const expectedWeights = BRAIN_INPUTS * hidden + (hidden + 1) * BRAIN_OUTPUTS;
    expect(weightCount(cfg)).toBe(expectedWeights);
    expect(genomeLength(cfg)).toBe(TRAIT_COUNT + expectedWeights);
  });

  it('genomeLength changes with brain.hidden', () => {
    const small = makeConfig({ brain: { hidden: 2 } });
    const big = makeConfig({ brain: { hidden: 10 } });
    expect(genomeLength(big)).toBeGreaterThan(genomeLength(small));
  });
});

describe('traitValue', () => {
  it('maps gene 0 to lo and gene 1 to hi for every trait', () => {
    for (let t = 0; t < TRAIT_COUNT; t++) {
      const name = TRAIT_NAMES[t];
      const [lo, hi] = cfg.phenotype[name];
      expect(traitValue(cfg, 0, t)).toBeCloseTo(lo, 9);
      expect(traitValue(cfg, 1, t)).toBeCloseTo(hi, 9);
    }
  });

  it('maps gene 0.5 to the midpoint', () => {
    const [lo, hi] = cfg.phenotype.size;
    expect(traitValue(cfg, 0.5, TRAIT.size)).toBeCloseTo((lo + hi) / 2, 9);
  });
});

describe('dietClass', () => {
  it('is herbivore below 0.35, carnivore above 0.65, omnivore between', () => {
    expect(dietClass(0)).toBe('herbivore');
    expect(dietClass(0.34)).toBe('herbivore');
    expect(dietClass(0.35)).toBe('omnivore');
    expect(dietClass(0.5)).toBe('omnivore');
    expect(dietClass(0.65)).toBe('omnivore');
    expect(dietClass(0.66)).toBe('carnivore');
    expect(dietClass(1)).toBe('carnivore');
  });
});

describe('visionClass', () => {
  it('is nocturnal below 0.35, crepuscular through 0.7, diurnal above', () => {
    expect(visionClass(0)).toBe('nocturnal');
    expect(visionClass(0.34)).toBe('nocturnal');
    expect(visionClass(0.35)).toBe('crepuscular');
    expect(visionClass(0.7)).toBe('crepuscular');
    expect(visionClass(0.71)).toBe('diurnal');
    expect(visionClass(1)).toBe('diurnal');
  });
});

describe('applyPhenotype', () => {
  it('fills pheno and the derived arrays consistently with the configured ranges', () => {
    const gLen = genomeLength(cfg);
    const store = new OrganismStore(2, gLen);
    const slot = store.alloc();
    // A deterministic, non-trivial gene per trait.
    for (let t = 0; t < TRAIT_COUNT; t++) {
      store.genome[slot * gLen + t] = (t + 1) / (TRAIT_COUNT + 1);
    }
    applyPhenotype(cfg, store, slot);

    for (let t = 0; t < TRAIT_COUNT; t++) {
      // Read back the actual float32-stored gene (writing a double literal
      // into store.genome already rounded it), then compare against the
      // exact float32-rounded traitValue of that stored gene.
      const storedGene = store.genome[slot * gLen + t];
      expect(store.pheno[slot * TRAIT_COUNT + t]).toBe(Math.fround(traitValue(cfg, storedGene, t)));
    }

    const size = store.pheno[slot * TRAIT_COUNT + TRAIT.size];
    const lifespanDays = store.pheno[slot * TRAIT_COUNT + TRAIT.lifespan];
    const maturityFrac = store.pheno[slot * TRAIT_COUNT + TRAIT.maturity];
    const breedFrac = store.pheno[slot * TRAIT_COUNT + TRAIT.breedThreshold];

    // Every comparison below reads back already float32-rounded pheno
    // values (size, lifespanDays, ...) and recomputes in double precision,
    // then re-rounds with Math.fround for an exact match against the
    // Float32Array the implementation actually wrote.
    const expectedEnergyMax = cfg.organisms.energyMaxBase * (0.5 + size);
    expect(store.energyMax[slot]).toBe(Math.fround(expectedEnergyMax));
    expect(store.body[slot]).toBe(Math.fround(cfg.organisms.bodyMassPerSize * size));
    const expectedLifespanTicks = lifespanDays * cfg.time.ticksPerDay;
    expect(store.lifespanTicks[slot]).toBe(Math.fround(expectedLifespanTicks));
    expect(store.maturityTicks[slot]).toBe(Math.fround(maturityFrac * expectedLifespanTicks));
    expect(store.breedEnergy[slot]).toBe(Math.fround(breedFrac * expectedEnergyMax));
  });

  it('does not touch other slots', () => {
    const gLen = genomeLength(cfg);
    const store = new OrganismStore(2, gLen);
    const a = store.alloc();
    const b = store.alloc();
    store.genome[a * gLen + TRAIT.size] = 1;
    store.genome[b * gLen + TRAIT.size] = 0;
    applyPhenotype(cfg, store, a);
    expect(store.energyMax[b]).toBe(0);
  });
});

describe('config: phenotype ranges are documented as assumptions', () => {
  it('every phenotype.* key exists in DOCS with assumption: true', () => {
    for (const name of TRAIT_NAMES) {
      const key = `phenotype.${name}`;
      expect(DOCS.has(key)).toBe(true);
      expect(DOCS.get(key).assumption).toBe(true);
    }
  });

  it('organisms.energyMaxBase, organisms.bodyMassPerSize and brain.hidden are documented assumptions', () => {
    for (const key of ['organisms.energyMaxBase', 'organisms.bodyMassPerSize', 'brain.hidden']) {
      expect(DOCS.has(key)).toBe(true);
      expect(DOCS.get(key).assumption).toBe(true);
    }
  });

  it('every DEFAULTS leaf still has a DOCS entry (regression guard)', () => {
    for (const [key] of flatten(DEFAULTS)) {
      expect(DOCS.has(key)).toBe(true);
    }
  });
});

/**
 * @param {number} value
 * @returns {Float32Array}
 */
function makeGenome(value) {
  return new Float32Array(genomeLength(cfg)).fill(value);
}

/**
 * @param {number[]} xs
 * @returns {number}
 */
function sampleStdDev(xs) {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

describe('mutate', () => {
  it('keeps every gene in [0,1] over 10,000 mutations of an extreme genome', () => {
    const rng = new Rng(1);
    const genome = makeGenome(1); // start at the boundary most likely to clamp
    for (let i = 0; i < 10000; i++) {
      mutate(rng, genome, 0, cfg);
    }
    for (let k = 0; k < genome.length; k++) {
      expect(genome[k]).toBeGreaterThanOrEqual(0);
      expect(genome[k]).toBeLessThanOrEqual(1);
    }
  });

  it('with pMut = 1 and pBig = 0 the per-gene change has sd ≈ σ (±15%)', () => {
    const bigOff = makeConfig({ genome: { pMut: 1, pBig: 0 } });
    const rng = new Rng(1);
    const genome = makeGenome(0.5);
    mutate(rng, genome, 0, bigOff);
    const deltas = [];
    for (let k = 0; k < genome.length; k++) {
      if (k === TRAIT.hue) continue; // hue has its own scaled sigma
      deltas.push(genome[k] - 0.5);
    }
    const sd = sampleStdDev(deltas);
    expect(sd).toBeGreaterThan(bigOff.genome.sigmaMut * 0.85);
    expect(sd).toBeLessThan(bigOff.genome.sigmaMut * 1.15);
  });

  it('with pMut = 0 and pBig = 1 the change has sd ≈ 4σ', () => {
    const bigOn = makeConfig({ genome: { pMut: 0, pBig: 1 } });
    const rng = new Rng(1);
    const genome = makeGenome(0.5);
    mutate(rng, genome, 0, bigOn);
    const deltas = [];
    for (let k = 0; k < genome.length; k++) {
      if (k === TRAIT.hue) continue;
      deltas.push(genome[k] - 0.5);
    }
    const sd = sampleStdDev(deltas);
    const expected = 4 * bigOn.genome.sigmaMut;
    expect(sd).toBeGreaterThan(expected * 0.85);
    expect(sd).toBeLessThan(expected * 1.15);
  });

  it('with pMut = pBig = 0 nothing changes', () => {
    const off = makeConfig({ genome: { pMut: 0, pBig: 0 } });
    const rng = new Rng(1);
    const genome = makeGenome(0.5);
    const before = genome.slice();
    mutate(rng, genome, 0, off);
    expect(genome).toEqual(before);
  });

  it('hue changes with sd ≈ σ·hueScale', () => {
    const forced = makeConfig({ genome: { pMut: 1, pBig: 0 } });
    const rng = new Rng(1);
    const deltas = [];
    for (let trial = 0; trial < 3000; trial++) {
      const genome = makeGenome(0.5);
      mutate(rng, genome, 0, forced);
      deltas.push(genome[TRAIT.hue] - 0.5);
    }
    const sd = sampleStdDev(deltas);
    const expected = forced.genome.sigmaMut * forced.genome.hueScale;
    expect(sd).toBeGreaterThan(expected * 0.85);
    expect(sd).toBeLessThan(expected * 1.15);
  });

  it('is deterministic for a given rng state', () => {
    const a = makeGenome(0.5);
    const b = makeGenome(0.5);
    mutate(new Rng(42), a, 0, cfg);
    mutate(new Rng(42), b, 0, cfg);
    expect(a).toEqual(b);
  });
});

describe('distance / distanceTo', () => {
  it('is symmetric, zero for identical trait blocks and ignores the weight block', () => {
    const gLen = genomeLength(cfg);
    const a = new Float32Array(gLen);
    const b = new Float32Array(gLen);
    for (let t = 0; t < TRAIT_COUNT; t++) {
      a[t] = t / TRAIT_COUNT;
      b[t] = t / TRAIT_COUNT;
    }
    // Differ only in the weight block: distance must still be 0.
    for (let k = TRAIT_COUNT; k < gLen; k++) {
      a[k] = 0;
      b[k] = 1;
    }
    expect(distance(a, 0, 0)).toBe(0); // trivially, same array/offset
    const combined = new Float32Array(gLen * 2);
    combined.set(a, 0);
    combined.set(b, gLen);
    expect(distance(combined, 0, gLen)).toBeCloseTo(0, 9);

    b[0] = a[0] + 0.5;
    const combined2 = new Float32Array(gLen * 2);
    combined2.set(a, 0);
    combined2.set(b, gLen);
    const d1 = distance(combined2, 0, gLen);
    const d2 = distance(combined2, gLen, 0);
    expect(d1).toBeCloseTo(0.5, 5);
    expect(d1).toBeCloseTo(d2, 9);

    expect(distanceTo(combined2, 0, combined2, gLen)).toBeCloseTo(d1, 9);
  });

  it('MAX_TRAIT_DISTANCE is sqrt(TRAIT_COUNT)', () => {
    expect(MAX_TRAIT_DISTANCE).toBeCloseTo(Math.sqrt(TRAIT_COUNT), 9);
  });
});
