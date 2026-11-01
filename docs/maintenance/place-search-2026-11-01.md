# Place-name search consistency — 2026-11-01

## Reproduction

Baseline: `1676af22d5d89f1f686c5e5125be1f90ce244ca4`.
The search field promises `商品名・ブランド・場所で探す`, but the actual
`render()` text-search array omitted the existing catalog `area` field.

With other filters clear and places mode selected, both audience views behaved
the same way in independent executions of the actual filter/order code:

| Query | Catalog facilities in that area | Baseline returned | Area facilities missing |
| --- | ---: | ---: | ---: |
| 東京 | 18 | 4 | 15 |
| 千葉 | 12 | 4 | 8 |

The four Tokyo-query results include a Chiba facility with 東京 in its name.
That valid pre-existing text match must remain; this is keyword search, not a
replacement for the exact area selector. The corrected Tokyo query returns 19
facilities; the corrected Chiba query returns 12.

The published baseline was also reproduced in a real PC browser on 2026-11-01
at 11:29 UTC: 東京 keyword 4, 千葉 keyword 4, versus 千葉 area selector 12.
Selecting 千葉 area and adding 千葉 keyword reduced the original result to 4.
No official source requests, favorite changes or browser fault injection occurred.

## Minimal correction and safeguards

Append `d.area` to the existing search-text array. Do not insert it between the
existing fields: that would break previously matching phrases spanning purpose
and category, such as `通いやすさ 練習場`.

There are no catalog, price, rank, layout, storage, analytics, workflow,
permission, retry or schedule changes. Existing audience/category/area/purpose/
budget/favorite filters still intersect with the keyword results.

Six offline regressions were added to the already executed
`scripts/test-catalog-prices.mjs` suite. They cover both audience views, area and
category intersections, other filters, original text and cross-field phrases,
query normalization, and empty search/unknown-price ordering. The actual
application normalization/filter/order block is executed, not a replacement
implementation. On the original app, three of the six new cases fail.

Validation of the candidate: 81 Node tests + 41 Python tests = 122 passed;
JavaScript syntax passed. Full image/static validation is performed by normal
PR CI, not claimed from the text-only local workspace.

This is an internal-consistency repair, not new official fact/stock verification.
Candidate browser and mobile behavior must not be inferred from the baseline
reproduction or earlier user-reported Safari results. Publication requires a
separate approval; after deployment, verify the affected search and filter flows.
