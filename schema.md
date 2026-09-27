# Data schema and evidence rules

One JSON file per robot in `data/robots/<slug>.json`. `<slug>` must match the
`slug` field exactly (kebab-case, e.g. `unitree-g1`).

## Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes | matches filename without `.json` |
| `name` | string | yes | model name, e.g. "G1" |
| `manufacturer` | object | yes | `{ name, country, url }` |
| `category` | enum | yes | one of `full-size`, `compact`, `research`, `industrial` |
| `announced` | object | yes | `{ date: YYYY-MM-DD, source }` |
| `specs` | object | yes | see Spec fields below |
| `price_history` | array | yes (may be empty) | see Price entries below |
| `delivery` | object | yes | `{ status, timeline: [] }` |
| `notes` | array | no | free-text notes, e.g. flagging contradicting sources |
| `updated` | string | yes | `YYYY-MM-DD`, last edit date of the file |

## Spec fields

`specs` holds a fixed set of keys, each optional individually but if present
must follow this shape:

```json
{ "value": <number|string>, "status": "claimed|demonstrated|shipped", "source": { ... } }
```

Recognized keys: `height_cm`, `weight_kg`, `dof`, `battery_runtime_min`,
`walking_speed_kmh`, `payload_kg`, `hands`, `hand_dof`, `fingers_per_hand`,
`tactile_skin`, `depth_cameras`, `compute`, `actuator_torque_nm`,
`battery_wh`, `battery_swappable`, `charge_time_min`, `locomotion`. Add
more only if a robot has a genuinely distinct, sourced attribute — do not
pad with unsourced fields. `tactile_skin` and `battery_swappable` are
boolean `value`s; `compute` is free text (e.g. "NVIDIA Jetson Thor");
`locomotion` is an enum `value`, one of `bipedal | wheeled | hybrid`; the
rest (`actuator_torque_nm` — peak/max torque in Nm, `battery_wh`,
`charge_time_min`) are numbers. All still follow the `{ value, status,
source }` shape above.

## Power, software, and buying (top-level, all optional)

These sit alongside `specs` at the top level, not inside it, because each
has its own shape.

`sdk` is a single object (not an array): `{ open_source: boolean, ros:
"none"|"ros1"|"ros2", url, status, source }`. `url` points at the SDK
itself (a repo, a docs page) — `source` is the evidence for the claim
(open-source status, ROS support), which is often the same page but kept
separate so a docs URL and an evidence quote don't have to collide.

`warranty` is an array, because coverage differs by region and reseller:
`[{ months, region, source, status }]`. Record one entry per region/seller
combination that has its own source; do not average or guess a global
number.

`order_type` is a single object, same shape as a spec entry: `{ value,
source, status }`, where `value` is one of `cart | quote | waitlist |
preorder | none` — `cart` means direct checkout with a price shown,
`quote` means a sales conversation is required before a price is given,
`waitlist` and `preorder` are self-explanatory, `none` means the robot is
not offered for sale at all (research-only, internal use).

`export_restrictions` is an array, `[{ jurisdiction, detail, source,
status }]`. Only record an entry when the source is a hard, named
decision (an export-control ruling, a government notice, a manufacturer
statement about which countries it will not ship to) — not a rumor, not
an analyst's guess about where sanctions might apply.

`delivery.timeline[].sector` is an optional enum on each timeline event,
one of `automotive | logistics | manufacturing | research | consumer |
healthcare | other` — the industry of the customer or deployment named in
that event, when known.

**Why lease prices, business financials, and scores are not tracked:**
this site records claimed/demonstrated/shipped facts with a primary
source behind each one. Lease pricing and financing terms are
negotiated per-deal and rarely published with a source that applies
generally; recording one publicly quoted lease rate would misrepresent it
as the going rate. Manufacturer revenue, funding, and valuation are
business facts about a company, not the robot, and belong in financial
press rather than a robot spec sheet. A composite "score" would require
weighting unlike properties (height against battery life against SDK
maturity) by some formula this site would have to invent and defend —
that is an opinion, not a sourced fact, and it's exactly the kind of
review-site judgment this project exists to avoid.

## Capabilities

`capabilities` is an optional array, one entry per demonstrated or claimed
ability:

```json
{ "id": "stairs", "status": "demonstrated", "autonomy": "autonomous", "source": { "url": "...", "quote": "...", "accessed": "2026-09-20", "timestamp": "01:23" }, "note": "" }
```

`id` must be one of the fixed ids in `data/capabilities.json` (each with a
label and short definition there); an unknown id fails validation.
`status` is the same `claimed | demonstrated | shipped` used everywhere else
(`shipped` means a named customer is shown using it, not just the
manufacturer). `source.timestamp` is optional, `mm:ss`, for pointing at the
moment in a video. With the evidence-review fields below, a supported video
requires a real segment start, the concrete robot variant, and
`review.method: "video"`. `source.timestamp_end` may add the segment end and
must be later than the start. `note` is optional free text.

`autonomy` is required and is one of `teleoperated | scripted | autonomous |
unknown`. A `demonstrated` capability with `autonomy: unknown` is allowed —
most manufacturer clips simply don't say. But `autonomy: autonomous` is only
allowed when the source explicitly says so (a named engineer or the
manufacturer states no human/teleoperator was driving it), or an independent
party observed it directly. A manufacturer highlight reel that shows a
capability without saying who or what controlled it must be recorded as
`unknown`, not `autonomous` — silence is not a claim.

## Media

`media` is an optional array, at most 3 entries per robot:

```json
{
  "type": "photo|drawing|patent",
  "file": "media/<slug>/<bestand>.jpg|png|svg",
  "caption": "...",
  "source": { "url": "...", "accessed": "2026-09-21" },
  "license": {
    "name": "manufacturer press kit|USPTO design patent|EUIPO RCD|WIPO|CC BY 4.0|other",
    "terms_url": "...",
    "note": "..."
  },
  "patent_number": "USD1000000S",
  "credit": "© Manufacturer",
  "depicts_current": false
}
```

`depicts_current` is optional and defaults to `true`. Set to `false` when the
image shows an earlier generation or a different variant than this record;
such media is kept for attribution and history but never used as the
record's product image or thumbnail.

**Licensed imagery is never evidence.** The robot page shows this section as
"Imagery" — patent drawings, press-kit photos, or Creative Commons photos —
each labelled with its type (patent drawing / press photo / CC photo) before
the credit. A photo or patent drawing shows what a robot looks like; it does
not demonstrate a spec, a capability, or a delivery. Nothing in `media` may
be cited as the `source` for a `claimed`, `demonstrated`, or `shipped` value
elsewhere in the record — those still need their own sourced quote.

**No hotlinking.** The file must be downloaded and committed under
`data/media/<slug>/`; `media[].file` never points at an external URL.
`media[].source.url` records where it was obtained, for attribution and
verification, not for serving the image.

**Only with an explicit license or a public patent.** Do not add an image
"because it's on the manufacturer's website" — a press kit expressly
offered for editorial/press use, a public patent drawing (design patents
are a public record; the drawing itself is not copyrighted the way a photo
is), or an explicitly CC-licensed image. When in doubt, leave it out.

`type` is one of `photo | drawing | patent`. `file` must be a path under
`data/media/` that exists on disk. `license.name` and `source` are always
required. `patent_number` is required when `type` is `patent` and should
be the number as printed on the patent (e.g. a USPTO design patent
`USD1,000,000 S`). `credit` is optional free text for a byline. Images are
resized at build time to a max width of 800px before being copied into
`dist/media/`.

## Promises

`promises` is an optional array, one entry per dated commitment a
manufacturer made about its own robot — a delivery, a production volume, a
launch, an "early access" window — in its own words:

```json
{
  "id": "<slug>-<kort>",
  "claim": "Full-scale Optimus production",
  "target": "2027",
  "made_on": "2026-04-22",
  "quote": "...",
  "source_url": "https://...",
  "source_name": "Tesla Q1 2026 earnings call",
  "accessed": "2026-09-27",
  "status": "open",
  "revised_to": "<promise id>",
  "met_evidence": "https://..."
}
```

`id` is unique within the robot's own `promises` array (not globally),
kebab-case, e.g. `tesla-optimus-full-scale-production`. `target` is the
manufacturer's own stated date, in whatever grain they gave it: an ISO
date (`2027-06-15`), a month (`2026-11`), a quarter (`2026-Q4`), a half
(`2027-H1`), or a bare year (`2027`). `made_on` is the date the promise was
made (not the date it was recorded); `accessed` is the date the source was
checked, same convention as everywhere else, and must be on or after
`made_on`. `quote` is a literal quote (max 300 characters, same rule as
`source.quote` elsewhere) of the manufacturer making the claim — this is a
`claimed`-tier record by construction, so there is no separate `status`
field for evidence tier the way specs have; `promises[].status` instead
tracks the promise's own outcome.

`status` is one of:

- `open` — the deadline has not yet passed and nothing has resolved it.
- `met` — a named delivery/production/launch happened that satisfies the
  claim; record the evidence URL in `met_evidence`.
- `missed` — the deadline passed with no resolving evidence, and nobody
  has recorded a replacement promise for it.
- `revised` — the manufacturer replaced this promise with a new one before
  or after the deadline; `revised_to` names the new promise's `id`.

Note that `status: "open"` is not updated automatically when its deadline
passes — the record stays `open` until someone records the outcome as
`met`, `missed`, or `revised`. The rendered page derives a display-only
`overdue` state for an `open` promise past its deadline (see
`tools/promises.js#effectiveStatus`); that derived state is never written
back to the data.

**Deadline rule** (`tools/promises.js#deadlineOf`): a bare year deadlines
on December 31 of that year; a quarter deadlines on the last day of that
quarter (Q1 03-31, Q2 06-30, Q3 09-30, Q4 12-31); a half deadlines on the
last day of that half (H1 06-30, H2 12-31); a month deadlines on that
month's last calendar day; an ISO date is its own deadline.
`daysLeft(target, today)` is the deadline minus today, in days — negative
means the deadline has passed.

## Source object

Every value — spec, price, or timeline event — carries a `source`:

| Field | Required | Notes |
|---|---|---|
| `url` | yes | link to the primary evidence |
| `quote` | yes | literal quote, max 300 characters |
| `accessed` | yes | `YYYY-MM-DD`, date the source was checked |
| `archive` | no | archive.org (or similar) permalink |
| `media_type` | no | `article | video | paper | repository | documentation | unknown` |
| `publisher_type` | no | `official | independent | community | unknown` |
| `variant` | no | concrete robot/model variant shown or described; required for every supported review |
| `published` | no | `YYYY-MM-DD`, publication date when known |
| `evidence_date` | no | `YYYY-MM-DD`, event or observation date when distinct from publication |
| `timestamp` | no | `mm:ss`, start of a real video segment |
| `timestamp_end` | no | `mm:ss`, optional segment end later than `timestamp` |
| `review` | no | evidence review object described below |

The optional `review` object records what was inspected for this specific
claim:

```json
{
  "status": "supported|insufficient|inaccessible|conflicting|unreviewed",
  "checked": "YYYY-MM-DD",
  "reason": "...",
  "method": "text|video|physical|unknown"
}
```

`checked` is required except for `unreviewed` and must be a real calendar
date. `reason` is required for
`insufficient`, `inaccessible`, and `conflicting`. `supported` means only
that the quoted or observed evidence supports this claim; it does not make a
manufacturer source independent and does not prove a claim universally true.
The claim's `status` and a capability's `autonomy` remain separate judgments.
Adding or changing a review never promotes either field.

A supported review requires an explicit, known `media_type`, a concrete
review method (not `unknown`), and a non-empty `variant`. A supported video review additionally requires
`media_type: "video"`, `method: "video"`, and a real `timestamp`. The video
method is invalid for every other media type. If `media_type` explicitly
names a non-video medium, timestamps are invalid. `media_type: "unknown"`
can only carry an unresolved review. A video that has not been
watched at a specific segment stays `unreviewed`, `insufficient`, or
`inaccessible`; `00:00` must never be used as a placeholder.

All new fields are additive. Existing source objects remain valid so legacy
gaps can be reviewed progressively instead of being filled with invented
metadata.

## Price entries

`price_history` is an array, oldest first:

```json
{ "date": "YYYY-MM-DD", "amount": <number>, "currency": "USD", "variant": "string", "status": "claimed|demonstrated|shipped", "source": { ... } }
```

## Delivery

`delivery.status` is the robot's current overall standing: `shipped`,
`demonstrated`, `claimed`, or `announced-only`. `delivery.timeline` is an
array of dated events:

```json
{ "date": "YYYY-MM-DD", "event": "announced|first-demo|preorders-open|first-customer-delivery|volume-estimate", "detail": "string", "quantity_min": null, "quantity_max": null, "source": { ... } }
```

Only include an event once it has real evidence. Do not invent a
`first-customer-delivery` event to fill a gap — if it hasn't happened, the
timeline simply stops at the last real event, and `delivery.status` reflects
that (`claimed` or `demonstrated`, not `shipped`).

## The three statuses, precisely

### claimed
The manufacturer's own words: a specs page on the manufacturer's domain, a
press release, a regulatory/investor filing, or an interview with a named
person and a date, published by the manufacturer or a credible outlet
quoting them directly. Blog posts, "reviews", or news articles that merely
repeat a number without citing the manufacturer directly do **not** qualify
as the source for a `claimed` value — trace it back to the manufacturer.

### demonstrated
An uncut video or live demonstration, run by an independent party (press,
customer, researcher), OR a manufacturer-produced video in which the
property in question is visibly performed with a timestamp (e.g. a battery
runtime demonstrated across a visibly continuous, timestamped clip). CGI
renders, heavily cut marketing reels, and "coming soon" trailers do not
qualify.

### shipped
A named customer, with photographic or video evidence of a physical unit in
their possession, plus at least one of: an invoice, a serial number, an
independent unboxing, or a customs/import record. A signed contract,
preorder, deposit, or a "shipping in Q4" statement is not shipped — it is
`claimed` (or `demonstrated` if a working unit was shown).

## Contradicting sources

If two credible sources disagree on a value (different height, different
delivery date, etc.), do not silently pick one. Record both, each with its
own `source` and `accessed` date, and add a short note in `notes` explaining
the discrepancy. The comparison table on the homepage links to whichever
value is most recently sourced, but the robot page must show both.

## Quantities

Delivered/produced quantities are almost never precisely disclosed. Use
`quantity_min` / `quantity_max` as a range, each end backed by its own
source where possible (e.g. "at least 500" from one filing, "fewer than
2,000" inferred from another). If no credible number exists at all, omit
the timeline event entirely rather than guessing.

## Events and results under fixed rules

One JSON file per competition event in `data/events/<slug>.json`. `<slug>`
must match the `slug` field exactly.

```json
{
  "slug": "world-humanoid-robot-games-2025",
  "name": "World Humanoid Robot Games 2025",
  "organizer": "World Humanoid Robot Sports Federation",
  "date": "2025-08-15",
  "location": "Beijing, China (National Speed Skating Oval)",
  "rules_url": "https://www.whrgoc.com/",
  "autonomy_rule": {
    "value": "mixed",
    "source": { "url": "...", "quote": "...", "accessed": "2026-09-21" }
  },
  "source": { "url": "...", "quote": "...", "accessed": "2026-09-21" }
}
```

`autonomy_rule.value` is one of `autonomous | teleoperated | mixed |
unknown` and describes how the event as a whole is run (e.g. "mixed" when
autonomous entries get a scoring bonus but most competitors are remote
controlled) -- it is not a claim about any single robot. `source` backs
the event's own facts (date, location, organizer).

A robot record may carry an optional `results` array, one entry per
recorded outcome at a tracked event:

```json
"results": [
  {
    "event": "world-humanoid-robot-games-2025",
    "discipline": "1500 m",
    "result": "6:34",
    "rank": 1,
    "team": "Unitree",
    "unit": "time",
    "autonomy": "teleoperated",
    "source": { "url": "...", "quote": "...", "accessed": "2026-09-21" }
  }
]
```

`event` must match a slug in `data/events/`. `rank` is an integer (1 =
first place) or `null` when no ranking applies (e.g. a solo timed attempt).
`autonomy` defaults to the event's own `autonomy_rule.value`; it may be
recorded differently for one result only when the source specifically says
so for that run (e.g. one entrant ran autonomously in an event otherwise
dominated by teleoperation) -- that source is the same `result.source`
already required on every entry.

**Why a fixed-rules result is the strongest demonstrated-layer evidence,
and still not `shipped`:** a manufacturer's own demo video can be cut,
staged, retried until it works, or narrated to imply more than happened. A
result at a competition with a published ruleset and an independent jury
cannot: the discipline, the clock, and the judging are fixed before the
robot shows up, and every entrant is measured the same way. That is why
this is the strongest evidence this site records short of a customer using
the robot in production. It is still not `shipped`: winning a race or a
match is not a named customer running the robot in their own operation,
and no continuous, independent, cross-manufacturer benchmark exists (NIST's
Humanoid Robot Baseline Performance Benchmark, still under development,
will publish only results aggregated across manufacturers, not per-robot,
per-run data) -- competition results are therefore reported alongside, not
folded into, the `claimed / demonstrated / shipped` ladder.

## Validation

`tools/validate.js` enforces: required fields present, `status` is exactly
one of the three values, every value-bearing object has a non-empty
`source.url`, `source.quote` (≤300 chars) and `source.accessed`
(`YYYY-MM-DD`), and `slug` matches the filename. For `capabilities`: `id`
must be in `data/capabilities.json` and `autonomy` must be one of the four
values. Optional evidence fields use the enums and relationships documented
under Source object; timestamps are `mm:ss`, a segment end follows its start,
and supported video evidence requires video review, variant, and timestamp.
For `results`:
`event` must match a slug under `data/events/`, `rank` must be an integer
or `null`, and `autonomy` must be one of `autonomous | teleoperated |
mixed | unknown`. Event records under `data/events/` are validated the
same way (required fields, dated fields, sourced `autonomy_rule`).

For the power/software/buying fields: `specs.locomotion.value` must be one
of `bipedal | wheeled | hybrid`; `sdk.ros` must be one of `none | ros1 |
ros2` and `sdk.open_source`/`sdk.url`/`sdk.status`/`sdk.source` are all
required when `sdk` is present; each `warranty[]` entry requires
`months`, `region`, `status`, and `source`; `order_type.value` must be one
of `cart | quote | waitlist | preorder | none`; each
`export_restrictions[]` entry requires `jurisdiction`, `detail`, `status`,
and `source`; `delivery.timeline[].sector`, when present, must be one of
`automotive | logistics | manufacturing | research | consumer |
healthcare | other`.

For `promises[]`: `id`, `claim`, `source_url`, `source_name` are required
non-empty strings; `target` must parse under the deadline rule above
(`tools/promises.js#isValidTarget`); `made_on` and `accessed` must be
`YYYY-MM-DD` with `made_on` on or before `accessed`; `quote` is required,
max 300 characters; `status` must be one of `open | met | missed |
revised`; `revised_to`, when present, must match another promise's `id`
within the same robot record; `met_evidence`, when present, must be a
non-empty string.

## Independence

humanoidrecord.com accepts no money, samples, or sponsorship from robot
manufacturers or their investors. Costs are carried by elk.solutions. Data
corrections come only with a public source. Automated checks are logged;
every change is a public commit with its source.

GitHub data mirror: [github.com/humanoidrecord/humanoidrecord-data](https://github.com/humanoidrecord/humanoidrecord-data). DOI: [10.5281/zenodo.22919641](https://doi.org/10.5281/zenodo.22919641).
