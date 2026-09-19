# Flatland: a world that doesn't need you watching

I've been building a browser-native artificial-life sim called Flatland — a
tile-based world where organisms hunt, graze, breed, evolve, and die, with
no score, no win condition, and no player character. Think of it as a super
advanced digital ant farm: the fun is watching, naming, and occasionally
poking things, not playing.

Three properties drove every design decision:

- **Stakes.** Energy is conserved. A lineage that overgrazes its valley
  starves. Extinction is permanent and logged. Nothing spawns from nowhere
  after genesis.
- **Legibility.** Evolution is visible without opening an inspector: sprites
  are generated from genomes, lineages are colored, and every world event
  gets a plain-language sentence and a place name.
- **Indifference.** The sim does not care whether you're watching. Idle mode
  is the default, and the few things a viewer can do (Hand of God actions —
  rain, fire, naming a lineage) are small and permanently written into the
  record.

## A world is a seed plus its history

Flatland never saves a world as a blob of state. A save, a share link, or a
test fixture is `{ seed, configDiff, interventions[] }` — the RNG seed, any
config overrides, and the ordered list of things you did to it (rain here,
fire there, renamed that lineage). Full state exists only as a cache for
fast resume; the seed and its history are the source of truth. Load the
link anywhere and it replays from genesis to the same point, byte-for-byte.

I generated a real one to check this, not a mockup string. I built a world
on seed 8, stepped it 500 ticks, queued a real `rain` intervention, stepped
further, renamed a founding species, stepped to tick 1500, and called
`encodeShare()` (`src/persist/share.js`) on the result. The interventions
list was:

```
[{"tick":501,"kind":"rain"},{"tick":1001,"kind":"rename","speciesId":0,"name":"Blog Test Lineage"}]
```

which `encodeShare` compacted (runs between interventions collapse into a
single "fast-forward N ticks" record) into a 114-byte base64url string:

```
WzEsOCx7fSxbWyJmZiIsNTAxXSxbInJhaW4iXSxbImZmIiw1MDBdLFsicmVuYW1lIiwwLCJCbG9nIFRlc3QgTGluZWFnZSJdLFsiZmYiLDQ5OV1dXQ
```

That's `?w=<that string>` on the URL — a whole 1,500-tick history plus two
interventions in about the length of a long tweet. `decodeShare()` round-
trips it exactly. The project's own test suite pushes this further: a
100,000-tick log with three interventions scattered across it still encodes
under 200 bytes (`test/unit/share.test.js`), because a share link never
carries state, only the seed and the handful of things that happened.

## What actually evolved on seeds 8 and 39

Two seeds are pinned in the soak-test suite (`test/soak/ecology.test.js`) as
long-run regression fixtures. I ran both fresh, at full length: `npm run
headless -- --seed 8 --ticks 100000` and `npm run headless -- --seed 39
--ticks 100000`, on the current tuned Phase 5 config (256×160 world,
crossover and swimming enabled). Every number below is straight from those
two runs' console output, plus a short follow-up script that scanned each
run's full chronicle for `first`- and `split`-kind entries (the standard
headless report only prints the last 10 chronicle lines).

**Seed 8** ended at tick 100,000 with 24 organisms alive: 12 herbivores, 1
omnivore, 11 carnivores, spread across 6 living species. Over the run: 101
births, 183 successful hunts, 63 speciation events, 130 extinctions, 69
immigrants arriving from off-map. Shannon diversity sat at 1.388 at the end
(1.519 averaged over the run). The first lineage to specialize as hunters
was **Meadow Hunters III**, splitting off the herbivorous Meadow Rovers at
tick 24,339 — the chronicle's actual sentence: "The Meadow Hunters III are
the first hunters to rise from the Meadow Rovers." Night hunting showed up
much earlier, at tick 7,200 ("The Meadow Browsers have taken to the
night."), and the first crossing of open water came at tick 12,607 ("The
Shore Grazers are the first to cross water."). The run's hash was `40ecfa4e`
— and I got the identical hash a second time from a completely separate,
independently written script that replayed the same seed and config to the
same tick, which is exactly the byte-identical guarantee the determinism
rule is supposed to buy.

**Seed 39** ended with 20 organisms: 10 herbivores, 3 omnivores, 7
carnivores, across 7 living species. 79 births, 171 hunts, 54 speciations,
106 extinctions, 55 immigrations, diversity 1.564 (avg 1.648). This seed's
niches opened almost immediately: the first night-active lineage and the
first water crossing both trace to the founding population itself (tick 0
and tick 23 respectively — "The Meadow Grazers have taken to the night" and
"The Meadow Grazers are the first to cross water"), while true predation
took much longer to emerge: **Meadow Hunters II** split from the herbivorous
Shore Rovers at tick 29,050. Hash: `0381c1e6`, likewise reproduced
identically on a second, independent run.

Two seeds, same config, same tick count — one evolves hunting at roughly a
quarter of the run and takes 7,200 ticks to find the night; the other finds
night and water on day one and doesn't produce a hunter lineage until nearly
30,000 ticks in. That's the kind of divergence a deterministic seed is
supposed to preserve exactly, not smooth over.

## Determinism, and why `fmath.js` exists

None of the above is reproducible if the simulation itself isn't
byte-identical from a bare seed. `src/core/**` never touches `Math.random`,
`Date`, or wall-clock time; every random draw comes from `world.rng` in a
fixed order. That much is standard. The subtler problem is transcendental
math: JS engines aren't required to agree on the last bit of `Math.sin`,
`Math.cos`, `Math.exp`, and friends, so two browsers running the exact same
seed and intervention log could quietly diverge by an epsilon per tick —
invisible at first, catastrophic after 100,000 ticks, and fatal to a share
link that's supposed to replay identically for whoever opens it.
`src/core/fmath.js` closes that gap: it reimplements `sin cos exp tanh
atan2 log` from `+ − × ÷`, `Math.sqrt`, `Math.floor`, and `Math.abs` —
operations every conforming engine computes identically — and an eslint
rule bans the `Math.*` transcendental versions inside `src/core` outright.
Small, annoying engineering with an unglamorous payoff: a share link
generated on a phone replays exactly the same on a laptop, forever.

## Try it

There's no build to install yet — this is a dev-branch draft, not a
deploy — but if you're following along in the repo:

```
npm run headless -- --seed 8 --ticks 100000
npm run headless -- --seed 39 --ticks 100000
```

prints the full ecology report and last 10 chronicle lines for either
pinned seed on your own machine, hash included, so you can check it
against the numbers above. Pick your own seed and watch a different
history unfold — nothing about seed 8 or 39 is special except that
they're the ones the regression suite already watches closely.

---

**Numbers in this post:** population, species, births, hunts, deaths,
speciations, extinctions, immigrations, diversity, vision histogram, and
hash for both seeds came from `npm run headless -- --seed 8 --ticks 100000`
and `npm run headless -- --seed 39 --ticks 100000`, run to completion on
this machine. The "first hunters"/"first to the night"/"first to cross
water" sentences and tick numbers came from a small Node script (the same
`World`/`runGenesis` calls `scripts/headless.mjs` makes) that scanned each
run's full chronicle for `KIND.FIRST` entries, since the shipped report
only prints the last 10 lines; both scans independently reproduced the same
hashes (`40ecfa4e`, `0381c1e6`) as the headless runs above. The share-link
string and byte length came from calling `encodeShare()` on a real `World`
after real `queueIntervention()` calls, round-tripped through
`decodeShare()`.
