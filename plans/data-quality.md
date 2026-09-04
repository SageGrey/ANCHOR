# Problems in the current data

Found by checking `data/ANCHOR_sites.geojson` and by looking up each
site in public records. Nothing here is fixed in the data. The
dashboard handles some of it; the rest needs the ANCHOR data owners.

The file holds 30 records. 29 have a location.

## 1. The acreage totals do not agree with the land cover columns

`Calculation_ANCHOR_ACRES_TOTAL` differs from the sum of the seven
`*_EstAcres` columns on **19 of 30 records**.

Largest differences:

| Site | Total | Sum of land cover | Difference |
| --- | ---: | ---: | ---: |
| MOTSU | 11,284 | 8,500 | +2,784 |
| Stockton Lake (Masters and Hawker Point South) | 1,154 | 90 | +1,064 |
| Kanopolis Lake | 2,271 | 3,290 | −1,019 |
| Melvern Lake | 352 | 547 | −195 |
| Barnett Woods and Prairie State Natural Area | 455 | 300 | +155 |
| Lytle Bend Meadow | 555 | 400 | +155 |
| Frog Valley | 172 | 302 | −130 |

The differences go both ways, so this is not one rule applied wrongly.

The dashboard uses the total for the footer and for the site details,
and the land cover columns for the bar chart in the details. The two
therefore disagree on screen, and a reader who adds up the chart will
not reach the total.

**Question: which number is correct?** If the total is the whole site
and the land cover columns cover only the part under management, that
is reasonable and the dashboard should say so. If the columns should
add up to the total, 19 records need correcting.

## 2. Four sites report acres with no land cover at all

| Site | Total acres |
| --- | ---: |
| Eagleville Wet Prairie | 89 |
| Eyheralde Savanna | 19 |
| Penn Prairie | 9 |
| Arnold Prairie | 1 |

Each has a positive total and zero in all seven land cover columns.
The details panel shows "No data recorded" under Land Cover for these
four.

These four are also invisible to the Primary Land Cover filter. Select
any land cover and they disappear, whatever they actually hold.

## 3. Practice acres exceed the land cover they belong to

A conservation practice column records acres under that practice
within a land cover group. On five sites the practice figure is larger
than the land cover figure it sits inside.

| Site | Column | Practice acres | Land cover acres |
| --- | --- | ---: | ---: |
| Melvern Lake | `PollHabMilkweed_4_MH` | 1,985 | 150 |
| Melvern Lake | `PollHabMilkweed_9_PB` | 794 | 150 |
| Melvern Lake | `PollHabMilkweed_2_NWVC` | 500 | 150 |
| Melvern Lake | `PollHabMilkweed_5_TT` | 200 | 150 |
| Melvern Lake | `NatGrass_9_PB` | 794 | 397 |
| Stockton Lake | `NatGrass_9_PB` | 800 | 90 |
| Kanopolis Lake | `GrazLandswCP_9_PB` | 1,400 | 1,300 |
| Best Hope Farm | `NatGrass_2_NWVC` | 62 | 30 |
| Best Hope Farm | `NatGrass_9_PB` | 40 | 30 |

Mowing 1,985 acres of a 150-acre area is 13 times over.

Two innocent explanations are possible. The figure may count repeat
treatments across several years, so 150 acres mowed 13 times is 1,985
acre-treatments. Or the person filling in the form may have entered
the whole site's acreage rather than the acreage within that land
cover group.

**Question: what does a practice column mean?** The dashboard only
tests whether it is greater than zero, so this does not affect the map
today. It will affect any report that adds these figures up.

## 4. One record has no location, no name and no acreage

One record has `ANCHOR_SiteName` of `529523683398`, no geometry, and
zero acres. Of its 65 columns, that name is the only one with a value
in it.

The prototype counted it. The footer showed "30 ANCHOR Sites" on load
and "29" after the first filter change, and never went back to 30.
Branch `fix/site-count-orphan-record` makes both paths count 29.

**This is a test submission.** The intake form's own service holds four
more columns than the exported file, and they identify it:

| Column | Value |
| --- | --- |
| `CreationDate` | 9 June 2026 |
| `Creator` | `FergusonLynch_Sage` |
| `AgencyOrPartner_FillingForm` | Sachin Kumar |
| `what_state_is_the_anchor_in` | `529523683398` |
| `what_countycounties_is_the_anch` | `529523683398` |

The same 12-digit number was typed into the site name, the state and
the county. It was created by a Ferguson Lynch account, not by a
partner. No site was lost.

**Action: delete the record from the intake form.** The dashboard
already leaves it out, so nothing on screen changes. Until it is
deleted, every export of this data carries a row that has to be
explained again.

## 5. Site names may identify landowners

Several names look like surnames: `Lambrecht`, `Eyheralde Savanna`,
`Morgan Farm`, `Best Hope Farm`, `Bask`.

This is a privacy problem, not a data quality problem, and moving the
markers does not solve it. It is covered in
[location-privacy.md](location-privacy.md). It is listed here because
it needs the same people to decide.

## 6. Small things

- `Kanopolis Lake ` has a space at the end of its name. The code
  removes it, so nothing breaks today. Any join that does not remove
  it will fail.
- `MixedPineSav_12_TPB` uses 12 where every other group uses 13 for
  the same practice. The dashboard matches on the ending, so it works.
  A join on the exact column name would not.
- `Melrose Air Force Range` has zero acres in every column, and is
  drawn on the map. It is a real place (Roosevelt County, New Mexico),
  so the acreage is missing rather than the site.
- `Barnett Woods and Prairie State Natural Area` records 455 acres.
  The state natural area is 40 acres. The ANCHOR site covers more than
  the natural area, and the rest may have a different owner. The
  official name is Barnett's Woods, with an apostrophe.

## What was checked and is correct

Not everything is a problem. These were checked and hold up:

- Every coordinate falls inside the continental United States, and
  every one falls in a county that fits its name.
- `Bobwhite Quail Focus Area` is at Letterkenny Army Depot, Franklin
  County, Pennsylvania. The Pennsylvania Game Commission manages about
  2,700 acres of quail habitat there. The record says 2,951 acres.
  That is a good match.
- `Guthrie Wet Prairie` is in Montgomery County, Tennessee, although
  it is named after Guthrie, Kentucky, just over the line. The
  location is right.
- `Kansas Hills` is in Robertson County, Tennessee, near a community
  called Kansas. It is not a Kansas record filed in the wrong state.
- `MOTSU` is Military Ocean Terminal Sunny Point, Brunswick County,
  North Carolina.
- `Melrose Air Force Range` is in Roosevelt County, New Mexico.

## Open questions, in order of importance

1. Which acreage figure is correct, the total or the land cover
   columns? (Section 1.)
2. What is the record with no location? (Section 4.)
3. What does a conservation practice column count? (Section 3.)
4. Why do four sites have acres but no land cover? (Section 2.)
5. Is `Spring Creek Prairie` the right name for the Montgomery County,
   Tennessee site? No public record of a Tennessee site with that name
   was found, and the name matches a well-known Nebraska site.
6. Should `Melrose Air Force Range` have acreage?
7. Does `Barnett Woods` cover land outside the state natural area, and
   who owns that part?
