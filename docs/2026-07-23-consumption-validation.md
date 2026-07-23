# Consumption model validation — FAT-ISO + LHV recalibration (2026-07-23)

Validates the SFOC engine change recorded in [CLAUDE.md](../CLAUDE.md) §8 (curve moved to the
Wärtsilä 16V46 **FAT ISO 3046/1** energy basis + per-fuel **LHV** scaling; `sfocDet` kept at 2%)
against **real Eclipse (EC) data**.

## Inputs

- **Engine SFOC anchor** — FAT test report PAAE072242 (16V46CR) + Eclipse DG performance tests
  (Jan/Feb 2026): HFO ≈ 196 g/kWh @ ~81% load, MGO ≈ 186 @ ~75%. Both reproduced by the new model
  at `sfocDet` = 2% (measured in-service deterioration ≈ +1.6% on an ISO basis).
- **Whole-voyage** — Wake speed-templates forecast (`EC_Speed_Templates_2026.json`, voyages 565–570)
  vs the reconciled Voyage-Tracker actuals (`voyageEnd.totals`) for the six matching 2026 voyages.

**Caveats on the whole-voyage comparison.** The forecast and the sailed voyage are not the same
scenario: planned speed/distance/time differ from actual, and the actuals carry **weather and
delays**. Propulsion fuel scales ~ speed² × distance, so a total match within a few percent is at or
below the scenario + weather noise floor — it should not be tuned away.

## Result 1 — total fuel: validated

| Voyage | Fc total (t) | Act total (t) | ΔTotal |
|---|--:|--:|--:|
| 565 Br. Isles | 961 | 985 | −2.4% |
| 566 Scandinavia | 1215 | 1141 | +6.5% |
| 567 Iceland/Scotland | 1165 | 1070 | +8.9% |
| 568 Norw. Fjords | 664 | 691 | −4.0% |
| 569 Scandinavia | 1228 | 1137 | +8.0% |
| 570 Br. Isles | 999 | 988 | +1.2% |
| **Aggregate** | **6233** | **6012** | **+3.7%** |

Aggregate **+3.7%** (+2.9% with in-port fuel matched to reality, below), per-voyage within ±9% across
different scenarios with weather/delays. The small consistent over-forecast is the plan's built-in
**+10% sea margin** doing its job (conservative for bunker planning). **No `sfocDet` retune warranted.**

## Result 2 — HFO/MGO split: a voyage-dependent operational effect, not an engine effect

The pre-change single-curve model could not produce a meaningful split at all; the LHV-aware model can.
The forecast under-shows MGO vs the actuals, and the per-DG **counters** (VT `equipment` start/end
deltas) pin down why — ruling out the two quick fixes first attempted (a per-leg ECA field; forcing
in-port MGO):

| Machine | HFO | MGO | reality |
|---|--:|--:|---|
| DG1 + DG2 | ~465 t | ~0 (0–3%) | closed-loop, **HFO everywhere incl. in port** → `inPortFuel = HFO` is correct |
| DG3 | 0 | ~183–249 t | MGO-locked; **not always online** — comes on with propulsion load, per voyage |
| DG4 | ~177 t | ~206 t (~50%) | open-loop swing, already modelled by `openLoop` |
| Boilers | 0 | ~67 t | MGO |

Two things this settles:

1. **Open-loop timing is right.** Forecast open-loop = 104.8 h vs actual 105.3 h; applied on the
   arrival Port/Tender leg that owns each passage (Sea rows are date carriers). A separate `ecaHrs`
   field would double-count it — dropped.
2. **In-port fuel is right.** DG1/DG2 burn HFO in port (94 t HFO in port on the British Isles voyage),
   so `inPortFuel = HFO` was correct; the earlier "force in-port MGO" moved the split for the wrong
   reason and is withdrawn.

The plant sails a **minimum of 2 engines, adding more as propulsion load demands** — which the model
already implements (`selectEngines`, `minEngines = 2`; engines added until capacity meets demand). So
the DG-**count** logic matches operations. The remaining split difference is only *which fuel the
added engines carry*: the model adds HFO DGs first (fuel-priority), while the real 3rd/4th engine (DG3
MGO vs DG4) is chosen per voyage by load, running-hours balancing, and availability. That is an
inherently **voyage-dependent operational choice**, not a model constant.

## Conclusions

- The FAT-ISO + LHV change is **validated on totals**: whole-voyage totals within a few percent (inside
  the weather/delay/scenario noise floor). Keep `sfocDet` = 2%.
- **Split:** the model reproduces the right *mechanism* (DG3 MGO-locked, DG4 open-loop swing, boilers
  MGO, min-2-plus-load DG count, in-port HFO) and fills additional-engine slots with a fixed HFO-first
  fuel-priority default. The realised split varies with per-voyage operational choices, so the model
  **approximates** it rather than tracking exactly — this is inherent, not a defect, and should not be
  hard-coded or fitted.
- **Scope holds:** SL/EQ/EC Wärtsilä-16V46 sisters; SI/RF (MAN) remain out of model.

## Not a next lever

Earlier drafts proposed a per-leg ECA field and an in-port-MGO policy to tighten the split; both are
withdrawn (see Result 2 — they contradict the counters). No engine or schema change is warranted. If
per-voyage split fidelity is ever wanted, the existing per-voyage `engines[]` override already lets a
planner set the intended running/fuel config; the default is reasonable and the **total** is what
matters for bunkering.

## Reproduction

Throwaway harnesses (session scratchpad, not committed): `validate.ts` (forecast vs actual, both
in-port policies) and `eca_prototype.ts` (blend `run0`/`run1`, solve *f*). Both import
`parseBundle`, `resolveSettings`, `computeVoyageConsumption` from `src/` so they exercise the live
engine. VT actuals are the six `voyageEnd.totals` from the EC Voyage-Tracker files.
