# D1 Source Map

This site build treats the generated static chunks as the served source of truth, with each generated field traceable to one of these local inputs.

## Served Outputs

- `data/vendor/d1_year_chunks/{year}.js`: first-load D1 rows by season.
- `data/vendor/d1_enriched_all_seasons_parts/*.js`: all-season D1 payload used when all rows are required.
- `data/vendor/d1_drives.js`: drive source mirror used by deferred D1 hydration.

## Inputs

- BartTorvik advanced, shot profile, height, and rate stats: `C:\Users\anu5c\Projects\multi-explorer-site-data\tab_sources\D1\barttorvik_cache\advstats_*_top365_all_ALL.json`.
- D1 playtypes: `C:\Users\anu5c\Projects\playtypes_master_2011_2025.csv` and `C:\Users\anu5c\Downloads\2026_Player_Playtype.csv`.
- D1 drives: `C:\Users\anu5c\Projects\multi-explorer-site-data\tab_sources\D1\drives\Completed * Drives*.csv`, including `Completed 2025-26 Drives_D1.csv`.
- D1 rim scoring: `C:\Users\anu5c\Projects\multi-explorer-site-data\tab_sources\D1\rim_drive_data\rim_iso_all.csv`, `rim_pnr_all.csv`, and `rim_su_all.csv`.
- Roster/weight backfill: `C:\Users\anu5c\Projects\multi-explorer-site-data\tab_sources\D1\roster_cache` and `data/vendor/d1_rosters.js`; the deeper hoopR/ncaahoopR box-score cache is under `C:\Users\anu5c\Projects\ncaahoopR_data`.

## Notes

- Steal and block rates are copied from BartTorvik `stl_per` and `blk_per`. Values over 25% in current data are tiny-minute rows from that source, not UI calculations.
- Drive rows before 2026 include possession, points, turnovers, free throws, field goals, two-point attempts, and +1. The 2026 drive file only has possession, points, FGA/FGM, FG%, and eFG%, so unavailable drive subfields remain blank instead of being coerced to zero.
- Rim scoring aggregates sum Iso, PnR, and Spot-Up rim files by player-season and compute the combined possession frequency against D1 total possessions.
