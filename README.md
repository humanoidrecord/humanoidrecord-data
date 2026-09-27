# humanoidrecord-data

The public dataset behind [humanoidrecord.com](https://humanoidrecord.com):
sourced specs, prices, and delivery claims for humanoid robots. Every value
carries a source URL, a literal quote, and an access date. Code for the site
lives in a separate repository; this repo carries only the data.

## The three statuses

- **claimed** — stated by the manufacturer itself (spec page, press release,
  filing, or a named, dated interview). Press coverage that just repeats the
  claim does not count.
- **demonstrated** — shown in an uncut video or live demo by an independent
  party, or a manufacturer video where the property is visible with a
  timestamp. Renders and edited marketing videos do not count.
- **shipped** — a named customer with photo/video evidence of an actual
  unit, an invoice or serial number, an independent unboxing, or a customs
  record. Preorders and "shipping in Q4" are not shipped.

See `schema.md` for the full field-by-field rules.

## Structure

- `robots/<slug>.json` — one file per robot, the source of truth.
- `robots.json` — every record, combined into one array.
- `robots.csv` — flat export, same fields as the humanoidrecord.com site.
- `media/<slug>/<file>` — licensed manufacturer imagery and patent
  drawings, when a robot record has a `media` field; each is captioned
  with its license and source in `robots/<slug>.json`. Never evidence for
  a claim — see `schema.md`.
- `schema.md` — field definitions and evidence rules.
- `schema-version.json` — machine-readable schema version and change list.
- `watch.json` — sources watched for updates per manufacturer.
- `LICENSE` — CC BY 4.0.

## Correcting a value

Open an issue using the [correction template](../../issues/new?template=correction.yml),
or email corrections@humanoidrecord.com. Include the source URL, a literal
quote, and the date you accessed it — corrections without a source are not
merged.

## Citing this data

```
Data from humanoidrecord.com, CC BY 4.0. Retrieved 2026-09-27 from
https://github.com/humanoidrecord/humanoidrecord-data
```

## License

CC BY 4.0 — see `LICENSE`. You may share and adapt this data for any
purpose, including commercially, with attribution to humanoidrecord.com.

## Site

https://humanoidrecord.com
