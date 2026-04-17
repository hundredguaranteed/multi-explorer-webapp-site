# Stat Definitions

Shared rule:
- All `%`, `rate`, `freq`, `share`, `FTr`, and `3Pr` columns are displayed on a `0-100` scale across the site.
- Player/Career stores one normalized shared column when multiple source aliases exist. Example: `fg2pct`, `2p_pct`, and `two_p_pct` all map to shared `two_p_pct`.

## Shared normalized columns

| Column | Display | Definition |
| --- | --- | --- |
| `gp` | `GP` | Games played |
| `min` | `MIN` | Total minutes |
| `mpg` | `MPG` | Minutes per game |
| `pts`, `trb`, `ast`, `stl`, `blk`, `tov`, `pf`, `stocks` | `PTS`, `TRB`, `AST`, `STL`, `BLK`, `TOV`, `PF`, `Stocks` | Totals; `stocks` is steals plus blocks |
| `pts_pg`, `trb_pg`, `ast_pg`, `ast_stl_pg`, `stl_pg`, `blk_pg`, `tov_pg`, `pf_pg`, `stocks_pg`, `two_pa_pg`, `three_pa_pg` | `PTS/G`, `AST+STL/G`, etc. | Total stat divided by `GP`; `ast_stl_pg` is assists plus steals per game |
| `pts_per40`, `trb_per40`, `ast_per40`, `ast_stl_per40`, `tov_per40`, `stl_per40`, `blk_per40`, `pf_per40`, `stocks_per40`, `two_pa_per40`, `three_pa_per40` | `PTS/40`, `AST+STL/40`, etc. | Total stat divided by `MIN`, multiplied by `40`; `ast_stl_per40` is assists plus steals per 40 minutes |
| `fgm`, `fga` | `FGM`, `FGA` | Total field goals made and attempted |
| `two_pm`, `two_pa` | `2PM`, `2PA` | Total two-point field goals made and attempted |
| `three_pm`, `three_pa` | `3PM`, `3PA` | Total three-point field goals made and attempted |
| `ftm`, `fta` | `FTM`, `FTA` | Total free throws made and attempted |
| `fg_pct` | `FG%` | `100 * FGM / FGA` |
| `two_p_pct` | `2P%` | `100 * 2PM / 2PA` |
| `three_p_pct` | `3P%` | `100 * 3PM / 3PA` |
| `ft_pct` | `FT%` | `100 * FTM / FTA` |
| `efg_pct` | `eFG%` | `100 * (FGM + 0.5 * 3PM) / FGA` |
| `ts_pct` | `TS%` | `100 * PTS / (2 * (FGA + 0.44 * FTA))` |
| `ftr` | `FTr` | `100 * FTA / FGA` |
| `three_pr` | `3Pr` | `100 * 3PA / FGA` |
| `rim_made`, `rim_att`, `rim_pct` | `Rim Made`, `Rim Att`, `Rim%` | Rim shot totals and `100 * rim_made / rim_att` |
| `mid_made`, `mid_att`, `mid_pct` | `Mid Made`, `Mid Att`, `Mid%` | Midrange shot totals and `100 * mid_made / mid_att` |
| `orb_pct`, `drb_pct`, `trb_pct` | `ORB%`, `DRB%`, `TRB%` | Offensive, defensive, total rebound rates |
| `ast_pct` | `AST%` | Assist rate |
| `tov_pct` | `TOV%` | Turnover rate |
| `stl_pct` | `STL%` | Steal rate |
| `blk_pct` | `BLK%` | Block rate |
| `usg_pct` | `USG%` | Usage rate |
| `ast_to` | `AST/TO` | Assists divided by turnovers |

## Carry-through stat families

These columns are imported into Player/Career directly from the source tabs and keep one consistent display format:

### Box-score families
- `*_pg`: per-game value on a `per game` basis
- `*_per40`: value normalized to `40` minutes
- `*_per100`: value normalized to `100` possessions
- `*_75`: value normalized to `75` possessions
- `*_made`, `*_att`, `*_miss`: made, attempted, missed totals
- `*_poss`: total possessions for the event, play type, or action

### Percentage / rate families
- `*_pct`: percent on a `0-100` scale
- `*_rate`: attempt or event rate on a `0-100` scale
- `*_freq`: play-frequency share on a `0-100` scale
- `*_share`: share of team output on a `0-100` scale
- `*_percentile`: percentile on a `0-100` scale

### D1 play-type families
- Prefixes like `iso_*`, `pnr_bh_*`, `post_up_*`, `pnr_roll_*`, `spot_up_*`, `off_screen_*`, `hand_off_*`, `cut_*`, `off_reb_*`, `transition_*`, `drive_*`, `runner_*`
- Suffix meanings:
  - `*_poss`: possessions
  - `*_freq`: possession share
  - `*_ppp`: points per possession
  - `*_fg_att`: field-goal attempts
  - `*_efg_pct`: effective FG%
  - `*_tov_pct`: turnover rate
  - `*_ftr`: free-throw rate
  - `*_two_fg_att`, `*_two_fg_pct`: two-point attempts and two-point %
  - `*_three_fg_att`, `*_three_fg_pct`: three-point attempts and three-point %
  - `*_three_pr`: three-point attempt rate

### NBA pace / shot-location families
- `fga_rim_75`, `fga_mid_75`, `fg3a_75`, `fta_75`, `fga_75`: per-75 possession volume
- `fgpct_rim`, `fgpct_mid`, `fg2pct`, `fg3pct`, `ftpct`, `tspct`, `efg`: source aliases normalized into shared columns in Player/Career
- `rim_ast_pct`, `mid_ast_pct`, `two_ast_pct`, `three_ast_pct`, `c3_ast_pct`, `ab3_ast_pct`, `smr_ast_pct`, `lmr_ast_pct`: assisted-shot shares by zone
- `rim_mid_ratio`: rim-to-mid shot mix ratio

### Translation / projection families
- `ncaa_spi_*`: NCAA SPI projection values
- `ncaa_off_impact_*`: projected NCAA offensive impact values
- `ncaa_def_impact_*`: projected NCAA defensive impact values
- `ncaa_wins_added_*`: projected NCAA wins-added values
- `d1_peak_*`: D1 peak summary metrics
- `nba_career_epm`: NBA career EPM summary

## Missing-value policy

- If totals and minutes are present, shared per-game, per-40, percentage, `FTr`, and `3Pr` fields are derived rather than left blank.
- If the source itself has no usable total or denominator, the cell remains blank instead of inventing a value.
