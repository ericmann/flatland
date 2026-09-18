import { describe, it, expect } from 'vitest';
import { makeConfig, DOCS, flatten, DEFAULTS } from '../../src/core/config.js';
import { OrganismStore, TRAIT_COUNT } from '../../src/core/organisms.js';
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
