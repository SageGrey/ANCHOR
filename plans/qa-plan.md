# QA plan for the filters and the dropdown options

## The request

> The QA process should validate that all dropdown options are
> comprehensive and correct... Also worth ensuring that the
> multilayered filtering is surfacing only desired sites.

## The automatic part

`scripts/check-data.mjs` does the counting. Run it whenever the data
changes:

```
node scripts/check-data.mjs
```

It reads the option values out of `index.html`, so it reports an
option that was added to the page and not to the data. It exits with a
status of 1 on a problem, so a build step can use it.

It reports three things:

- How many sites each dropdown option matches.
- Any option that matches no site.
- Any site that matches no option in a category, and therefore
  disappears as soon as the reader touches that category.

## What it finds today

### One problem

**"Native Long Savanna" matches no site.** All 29 mapped sites hold
zero in `NatLongSav_EstAcres`. A reader who selects it gets an empty
map and no reason for it.

Two possible causes, and they need different fixes:

1. No ANCHOR site has this land cover yet. Then the option is correct
   and should stay, because a site will have it later. The dashboard
   should say "No sites match" instead of showing nothing.
2. The column is never filled in, although sites do hold this cover.
   Then the data is wrong and the intake form needs checking.

**Ask the ANCHOR data owners which it is.** Do not remove the option
until they answer.

### Two warnings

**Five sites match no land cover option**: Melrose Air Force Range,
Eagleville Wet Prairie, Penn Prairie, Eyheralde Savanna and Arnold
Prairie. The same five match no conservation practice option.

They disappear as soon as the reader selects anything in either
category. A reader looking for "sites with native grassland" will not
see Penn Prairie, whether or not Penn Prairie has native grassland,
because the record does not say.

Four of the five report a positive total acreage with no breakdown at
all. See [data-quality.md](data-quality.md), section 2. This is the
same fault seen from the filter side.

### Counts to check against

Recorded on the current data. If these change without the data
changing, something is wrong.

| Category | Option | Sites |
| --- | --- | ---: |
| Ownership | Public | 14 |
| Ownership | Private | 11 |
| Ownership | Non-Profit | 4 |
| Land cover | Native Grassland | 23 |
| Land cover | Pollinator Habitat: Milkweed | 6 |
| Land cover | Pollinator Habitat: Nectar | 6 |
| Land cover | Mixed Pine Savanna | 4 |
| Land cover | Cropland | 3 |
| Land cover | Grazing Lands | 2 |
| Land cover | Native Long Savanna | 0 |
| Practice | Prescribed Burning | 23 |
| Practice | Chemical Veg. Control | 19 |
| Practice | Native Grass / Forb Plantings | 17 |
| Practice | Mowing / Haying | 16 |
| Practice | Timber Thinning | 15 |
| Practice | Mechanical Brush Mgmt. | 13 |
| Practice | Mechanical/Manual Veg. Control | 10 |
| Practice | Tree Planting | 3 |

The 14 public sites include Barnett's Woods, which the prototype
classified as non-profit. See [ownership-data.md](ownership-data.md).

## The manual part

The script checks the data. It does not check the interface. Do these
by hand.

### How the filters are meant to work

- Within one category, the selected options are joined with OR. Select
  Public and Private, and a site that is either one matches.
- Across categories, the result is joined with AND. Select Public and
  Native Grassland, and a site must be both.
- A category with nothing selected matches every site.

### Test the rules

| Selection | Expected | Why |
| --- | --- | ---: |
| Nothing | 29 sites | Every mapped site |
| Public | 14 | One category, one option |
| Public + Private | 25 | OR within a category |
| Public + Private + Non-Profit | 29 | Every class |
| Native Grassland | 23 | One category, one option |
| Public AND Native Grassland | 12 | AND across categories |
| Public AND Native Grassland AND Prescribed Burning | 11 | Three categories |
| Native Long Savanna | 0 | The empty option |

Read the count from the "ANCHOR Sites" tile in the footer.

### Test the interface

1. **Faded sites.** A site that does not match stays hidden until zoom
   level 9 or closer. Above that zoom it is grey. Confirm a grey site
   is still clickable and that its details still open.
2. **Clearing.** The clear button is off until something is selected.
   Select in two categories, clear, and confirm every box is unticked
   and the count returns to 29.
3. **Desktop and mobile stay in step.** The three desktop dropdowns
   and the one mobile panel are separate parts of the page showing the
   same state. Select on desktop, make the window narrow, and confirm
   the mobile panel shows the same selection. Then do the reverse.
4. **Button text.** One selection shows its name. More than one shows
   "Name +2". Confirm the number is right.
5. **Popup and filters.** Open a site's details, then apply a filter
   that excludes it. The details must close.
6. **Zero matches.** Select a combination that matches nothing.
   Confirm the map empties, the footer shows 0, and the live region
   says "No ANCHOR sites match the selected filters".
7. **The states count.** Select Public. The states count must fall to
   the number of states that hold a public site, not stay at 9.

### Test the export

The map export always shows the whole network, whatever is filtered on
screen. Apply a filter, export, and confirm the image shows every site
and the full totals.

## Who must answer

1. Is "Native Long Savanna" a real gap in the data, or a land cover no
   ANCHOR site holds yet?
2. Should a site with no land cover recorded be excluded by the land
   cover filter, as now, or should it be treated as unknown and kept?
   The second is more work and it may be more honest.
3. Should the dashboard show a message when no site matches? It shows
   an empty map today. A screen reader is told, but a sighted reader
   is not.
4. Are the three ownership classes the full set? See
   [ownership-data.md](ownership-data.md).
