# Humanoid Record factsheet

Cutoff: 2026-09-27

Counts describe records within this register; they are not estimates of the humanoid robotics market.

Robot records, capability records, claim sources, artifacts and actuator groups use separate denominators.

## Register counts

- Robot records: 29
- Robot records with one or more capability records: 18
- Capability records: 26
- Capability status (denominator 26 records): claimed 4, demonstrated 21, shipped 1, unknown 0
- Capability autonomy (denominator 26 records): autonomous 6, teleoperated 10, scripted 1, unknown 9

No percentage about demonstrated autonomy or teleoperation is calculated without a defined, reviewed video unit.

## Claim-source review

- Claim-source records: 341
- Review status (denominator 341 claim-source records): supported 22, insufficient 54, inaccessible 12, conflicting 0, unreviewed 0, unknown or missing 253
- Source media type (same denominator): video 0, non-video 88, unknown or missing 253
- Claims queued for review: 319

## Simulation and actuators

- Simulation review (denominator 29 robot records): found 7, not confirmed 22, missing 0, unknown 0
- Simulation artifacts: 11
- Simulator compatibility statements: documented 3, tested 0, unknown 0
- Actuator review (denominator 29 robot records): found 3, not confirmed 26, missing 0, unknown 0
- Actuator groups: 4; drive known 2, transmission known 2, motion known 0, architecture known 0, all four unknown 0

## Recorded gaps

- Robot records without hand DoF: 23
- Robot records without fingers per hand: 29
- Robot records without simulation review: 0
- Robot records without actuator architecture review: 0
- Capability records without explicit source media type: 0
- Capability records without source timestamp: 26

## Reproduction metadata

- Data schema: 2.2
- Definitions: 1
- Dataset SHA-256: b02f89a04d032a6742704175872b5b3050c0832fb6222e78627808e07cc64b5c
- Dataset Git commit: f5f41e3b8debfce3422f9e7fac4a89d5a7ab8e2a
- Generator SHA-256: 1fb139a5b5c20f0c5444b56902c1a69731eb37eceee2380df710943ec79035c3
- Generator file: tools/data-quality.js (fda08cb19d25ba5cc10305579506c5671deb0943c418db4a900b43b3dc475973)
- Generator file: tools/factsheet.js (bbabc458b6d2a7da8e901756ff647b41de342e98097bacda5dd6d9032199f786)
