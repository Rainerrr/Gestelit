# BINA Sync Checkpoint - 2026-05-20

Captured after the daytime broad UTF-8 backfill was manually stopped because BINA users reported slowness.

## Stop Point

- Checked at: `2026-05-20T10:29:57Z`
- Last incoming sync log: `2026-05-20T10:21:50Z`
- Last completed table: `DFHazmKedam`
- Last completed batch: `DFHazmKedam: 359`
- Next table in the current script order: `DFHazmGlyonot`

The sync was stopped before `DFHazmGlyonot` began sending rows.

## Completed In The Big Backfill

| BINA table | Supabase table | Rows now | Latest synced_at |
| --- | --- | ---: | --- |
| DFHazmRashi | bina_dfhazmrashi | 27,233 | 2026-05-20T09:36:21.870622+00:00 |
| DFHazmMontage | bina_dfhazmmontage | 56,366 | 2026-05-20T09:47:04.944453+00:00 |
| DFHazmNigrar | bina_dfhazmnigrar | 56,126 | 2026-05-20T09:51:57.225859+00:00 |
| DFHazmGimur | bina_dfhazmgimur | 56,464 | 2026-05-20T09:57:17.487571+00:00 |
| DFHazmGrafika | bina_dfhazmgrafika | 56,464 | 2026-05-20T10:02:01.263014+00:00 |
| DFHazmKirkia | bina_dfhazmkirkia | 45,497 | 2026-05-20T10:05:13.275553+00:00 |
| DFHazmKedam | bina_dfhazmkedam | 41,559 | 2026-05-20T10:21:49.933695+00:00 |

## Not Yet Backfilled

These tables were still at the previous small UTF-8 test / earlier sync level when the run was stopped.

| BINA table | Supabase table | Rows now | Latest synced_at |
| --- | --- | ---: | --- |
| DFHazmGlyonot | bina_dfhazmglyonot | 97 | 2026-05-03T09:32:17.908377+00:00 |
| Mismahim | bina_mismahim | 2,088 | 2026-05-14T09:15:12.392736+00:00 |
| DFMlay | bina_dfmlay | 2,044 | 2026-05-14T09:15:13.15464+00:00 |
| TnuotMlay | bina_tnuotmlay | 0 | null |
| HeshSapakRashi | bina_heshsapakrashi | 2,020 | 2026-05-14T09:15:13.722068+00:00 |
| HeshSapakNigrar | bina_heshsapaknigrar | 2,020 | 2026-05-14T09:15:14.174959+00:00 |
| TMSapakNigrar | bina_tmsapaknigrar | 2,020 | 2026-05-14T09:15:14.622503+00:00 |
| BakashaNigrar | bina_bakashanigrar | 2,020 | 2026-05-14T09:15:15.32147+00:00 |
| Hovot | bina_hovot | 2,017 | 2026-05-14T09:15:15.813853+00:00 |
| DFShelita | bina_dfshelita | 2,020 | 2026-05-14T09:15:16.270413+00:00 |
| HeshbonitRashi | bina_heshbonitrashi | 2,020 | 2026-05-14T09:15:17.028669+00:00 |
| HeshbonitNigrar | bina_heshbonitnigrar | 2,020 | 2026-05-14T09:15:17.481545+00:00 |
| MishloahRashi | bina_mishloahrashi | 2,020 | 2026-05-14T09:15:18.291104+00:00 |
| MishloahNigrar | bina_mishloahnigrar | 2,020 | 2026-05-14T09:15:19.567127+00:00 |
| TovinRashi | bina_tovinrashi | 2,020 | 2026-05-14T09:15:20.153461+00:00 |
| TovinNigrar | bina_tovinnigrar | 2,020 | 2026-05-14T09:15:20.610763+00:00 |
| SqlLogins | bina_sqllogins | 2,020 | 2026-05-14T09:15:21.046301+00:00 |

## Resume Guidance

Current `bina-sync-ready.ps1` starts from the beginning every time. Rerunning is safe because the API upserts by `bina_id`, but it will reread and resend the large completed production tables unless the script is modified.

For after-hours resume, prefer adding a resume parameter to skip completed tables and start at `DFHazmGlyonot`.

If running the existing script unchanged, use after-hours only:

```powershell
powershell -ExecutionPolicy Bypass -File C:\bina-sync\bina-sync-ready.ps1 -MaxRecentOrders 100000 -BatchSize 400
```

For business hours, avoid the broad backfill. Use the hourly smaller sync:

```powershell
powershell -ExecutionPolicy Bypass -File C:\bina-sync\bina-sync-ready.ps1 -MaxRecentOrders 2000 -BatchSize 400
```

## Known Issue

`TnuotMlay` remains empty because the script expects key column `MisparTnua`, which was previously missing or incompatible in the BINA result. Keep it deferred until the source key is fixed.

