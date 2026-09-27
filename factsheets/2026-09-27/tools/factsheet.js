#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  buildQualityReport,
  datasetSha256,
  isCalendarDate,
} = require("./data-quality.js");

const DEFINITIONS_VERSION = "1";
const SHA256_RE = /^[a-f0-9]{64}$/;
const GIT_COMMIT_RE = /^[a-f0-9]{40,64}$/;
const REQUIRED_GENERATOR_FILES = ["tools/data-quality.js", "tools/factsheet.js"];
const SOURCE_REVIEW_STATUSES = ["supported", "insufficient", "inaccessible", "conflicting", "unreviewed"];
const SIMULATION_REVIEW_STATUSES = ["found", "not_confirmed"];
const COMPATIBILITY_LEVELS = ["documented", "tested"];

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function countKnown(values, known) {
  const counts = Object.fromEntries(known.map((value) => [value, 0]));
  counts.unknown = 0;
  for (const value of values) {
    if (known.includes(value)) counts[value] += 1;
    else counts.unknown += 1;
  }
  return counts;
}

function validateRawFiles(rawFiles) {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    throw new Error("rawFiles must be a non-empty array");
  }
  const paths = new Set();
  for (const file of rawFiles) {
    if (!file || typeof file.path !== "string" || !file.path || typeof file.raw !== "string") {
      throw new Error("every raw file needs a non-empty path and exact UTF-8 string content");
    }
    if (paths.has(file.path)) throw new Error(`duplicate raw file path: ${file.path}`);
    paths.add(file.path);
  }
  return [...rawFiles].sort((a, b) => compareText(a.path, b.path));
}

function schemaVersionFromFiles(rawFiles) {
  const file = rawFiles.find((entry) => entry.path === "data/schema-version.json");
  if (!file) throw new Error("snapshot must include data/schema-version.json");
  let parsed;
  try {
    parsed = JSON.parse(file.raw);
  } catch (error) {
    throw new Error(`data/schema-version.json is invalid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed.schemaVersion !== "string" || !parsed.schemaVersion) {
    throw new Error("data/schema-version.json must contain schemaVersion");
  }
  return parsed.schemaVersion;
}

function sha256(raw) {
  return require("crypto").createHash("sha256").update(raw, "utf8").digest("hex");
}

function normalizeGeneratorFiles(generatorFiles) {
  const files = validateRawFiles(generatorFiles);
  const paths = files.map((file) => file.path);
  if (JSON.stringify(paths) !== JSON.stringify(REQUIRED_GENERATOR_FILES)) {
    throw new Error(`generatorFiles must contain exactly: ${REQUIRED_GENERATOR_FILES.join(", ")}`);
  }
  return files.map((file) => ({ ...file, sha256: sha256(file.raw) }));
}

function generatorCombinedSha256(files) {
  return datasetSha256(files.map((file) => ({ path: file.path, raw: file.raw })));
}

function createSnapshot({ rawFiles, asOf, schemaVersion, dataGitHead, generatorFiles }) {
  if (!isCalendarDate(asOf)) throw new Error("asOf must be a calendar-valid YYYY-MM-DD");
  if (typeof schemaVersion !== "string" || !schemaVersion) throw new Error("schemaVersion is required");
  if (typeof dataGitHead !== "string" || !GIT_COMMIT_RE.test(dataGitHead)) {
    throw new Error("dataGitHead must be a pinned 40- or 64-character lowercase Git commit id");
  }
  const sortedFiles = validateRawFiles(rawFiles);
  const normalizedGeneratorFiles = normalizeGeneratorFiles(generatorFiles);
  const exportedSchemaVersion = schemaVersionFromFiles(sortedFiles);
  if (exportedSchemaVersion !== schemaVersion) {
    throw new Error(`schemaVersion mismatch: requested ${schemaVersion}, dataset exports ${exportedSchemaVersion}`);
  }
  if (!sortedFiles.some((file) => /^data\/robots\/[^/]+\.json$/.test(file.path))) {
    throw new Error("snapshot must include all selected data/robots JSON records");
  }
  return {
    snapshotVersion: 1,
    definitionsVersion: DEFINITIONS_VERSION,
    asOf,
    dataSchemaVersion: schemaVersion,
    dataGitHead,
    generator: {
      algorithm: "sha256",
      framing: "JSON array of [repository-relative path, raw UTF-8 content], sorted by path",
      sha256: generatorCombinedSha256(normalizedGeneratorFiles),
      files: normalizedGeneratorFiles,
    },
    dataset: {
      algorithm: "sha256",
      framing: "JSON array of [repository-relative path, raw UTF-8 content], sorted by path",
      sha256: datasetSha256(sortedFiles),
    },
    rawFiles: sortedFiles,
  };
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.snapshotVersion !== 1 || snapshot.definitionsVersion !== DEFINITIONS_VERSION) {
    throw new Error(`snapshotVersion 1 and definitionsVersion ${DEFINITIONS_VERSION} are required`);
  }
  if (!isCalendarDate(snapshot.asOf)) throw new Error("snapshot asOf must be a calendar-valid YYYY-MM-DD");
  if (typeof snapshot.dataSchemaVersion !== "string" || !snapshot.dataSchemaVersion) {
    throw new Error("snapshot dataSchemaVersion is required");
  }
  if (typeof snapshot.dataGitHead !== "string" || !GIT_COMMIT_RE.test(snapshot.dataGitHead)) {
    throw new Error("snapshot dataGitHead must be a pinned Git commit id");
  }
  if (!snapshot.generator || snapshot.generator.algorithm !== "sha256") {
    throw new Error("snapshot generator provenance is required");
  }
  const generatorFiles = normalizeGeneratorFiles(snapshot.generator.files);
  for (const file of generatorFiles) {
    const stored = snapshot.generator.files.find((entry) => entry.path === file.path);
    if (!stored || !SHA256_RE.test(stored.sha256 || "") || stored.sha256 !== file.sha256) {
      throw new Error(`snapshot generator file hash does not match ${file.path}`);
    }
  }
  if (!SHA256_RE.test(snapshot.generator.sha256 || "") ||
      snapshot.generator.sha256 !== generatorCombinedSha256(generatorFiles)) {
    throw new Error("snapshot combined generator hash does not match its exact code files");
  }
  const sortedFiles = validateRawFiles(snapshot.rawFiles);
  if (schemaVersionFromFiles(sortedFiles) !== snapshot.dataSchemaVersion) {
    throw new Error("snapshot dataSchemaVersion does not match data/schema-version.json");
  }
  const actualHash = datasetSha256(sortedFiles);
  if (!snapshot.dataset || snapshot.dataset.algorithm !== "sha256" || snapshot.dataset.sha256 !== actualHash) {
    throw new Error("snapshot dataset hash does not match its raw files");
  }
  return sortedFiles;
}

function validateRuntimeGenerator(snapshot) {
  const runtimeFiles = normalizeGeneratorFiles([
    { path: "tools/data-quality.js", raw: fs.readFileSync(require.resolve("./data-quality.js"), "utf8") },
    { path: "tools/factsheet.js", raw: fs.readFileSync(__filename, "utf8") },
  ]);
  const storedByPath = new Map(snapshot.generator.files.map((file) => [file.path, file]));
  for (const file of runtimeFiles) {
    if (!storedByPath.has(file.path) || storedByPath.get(file.path).sha256 !== file.sha256) {
      throw new Error(`runtime generator code does not match snapshot: ${file.path}`);
    }
  }
  if (generatorCombinedSha256(runtimeFiles) !== snapshot.generator.sha256) {
    throw new Error("runtime generator code does not match snapshot combined hash");
  }
}

function robotsFromFiles(rawFiles) {
  return rawFiles
    .filter((file) => /^data\/robots\/[^/]+\.json$/.test(file.path))
    .map((file) => ({ path: file.path, robot: JSON.parse(file.raw), raw: file.raw }))
    .sort((a, b) => compareText(a.path, b.path));
}

function sourceClaims(robots) {
  const claims = [];
  function visit(value, pathParts, robotSlug) {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value) && value.source && typeof value.source === "object" && !Array.isArray(value.source)) {
      claims.push({ robot: robotSlug, pointer: `/${[...pathParts, "source"].join("/")}`, source: value.source });
    }
    for (const key of Object.keys(value).sort(compareText)) {
      if (key === "source" || pathParts[0] === "media") continue;
      visit(value[key], [...pathParts, key], robotSlug);
    }
  }
  for (const robot of robots) visit(robot, [], String(robot.slug || ""));
  return claims;
}

function sourceMediaBucket(mediaType) {
  if (mediaType === "video") return "video";
  if (["article", "paper", "repository", "documentation"].includes(mediaType)) return "non_video";
  return "unknown";
}

function nonEmptyValue(value) {
  if (typeof value === "string") return value.trim() !== "";
  if (value && typeof value === "object" && !Array.isArray(value)) return nonEmptyValue(value.value);
  return value !== undefined && value !== null && value !== false;
}

function buildFactsheet(snapshot) {
  const rawFiles = validateSnapshot(snapshot);
  const robotRecords = robotsFromFiles(rawFiles);
  const robots = robotRecords.map((entry) => entry.robot);
  const quality = buildQualityReport({
    rawFiles,
    asOf: snapshot.asOf,
    code: {
      gitHead: snapshot.dataGitHead,
      generatorSha256: snapshot.generator.sha256,
      dirty: false,
    },
  });
  const claims = sourceClaims(robots);
  const sourceReviewStatuses = countKnown(
    claims.map((claim) => claim.source.review && claim.source.review.status),
    SOURCE_REVIEW_STATUSES,
  );
  const sourceMediaTypes = countKnown(
    claims.map((claim) => sourceMediaBucket(claim.source.media_type)),
    ["video", "non_video"],
  );

  const simulationReview = [];
  let simulationArtifacts = 0;
  const compatibility = [];
  for (const robot of robots) {
    const simulation = robot.simulation;
    simulationReview.push(simulation && simulation.review ? simulation.review.status : "missing");
    const artifacts = simulation && Array.isArray(simulation.artifacts) ? simulation.artifacts : [];
    simulationArtifacts += artifacts.length;
    for (const artifact of artifacts) {
      const entries = Array.isArray(artifact.compatibility) ? artifact.compatibility : [];
      for (const entry of entries) compatibility.push(entry && entry.level);
    }
  }

  const actuatorReview = [];
  const actuatorGroups = [];
  for (const robot of robots) {
    const architecture = robot.actuator_architecture;
    actuatorReview.push(architecture && architecture.review ? architecture.review.status : "missing");
    if (architecture && Array.isArray(architecture.groups)) actuatorGroups.push(...architecture.groups);
  }
  const groupFields = ["drive", "transmission", "motion", "architecture"];

  return {
    factsheetVersion: 1,
    scope: {
      statement: "Counts describe records within this register; they are not estimates of the humanoid robotics market.",
      selection: "All data/robots/*.json records included in the pinned snapshot.",
      unitWarning: "Robot records, capability records, claim sources, artifacts and actuator groups use separate denominators.",
      videoAssessment: "No percentage about demonstrated autonomy or teleoperation is calculated without a defined, reviewed video unit.",
    },
    cutoff: snapshot.asOf,
    dataSchemaVersion: snapshot.dataSchemaVersion,
    definitionsVersion: snapshot.definitionsVersion,
    provenance: {
      datasetSha256: snapshot.dataset.sha256,
      dataGitHead: snapshot.dataGitHead,
      generatorSha256: snapshot.generator.sha256,
      generatorFiles: snapshot.generator.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
    },
    metrics: {
      robotRecords: quality.counts.robots,
      capabilityRecords: quality.counts.capabilityRecords,
      claimSourceRecords: {
        total: claims.length,
        reviewStatus: sourceReviewStatuses,
        mediaType: sourceMediaTypes,
        queuedForReview: quality.sourceReviewQueue.length,
      },
      simulation: {
        robotReviewStatus: countKnown(simulationReview, [...SIMULATION_REVIEW_STATUSES, "missing"]),
        artifacts: simulationArtifacts,
        compatibility: countKnown(compatibility, COMPATIBILITY_LEVELS),
      },
      actuatorArchitecture: {
        robotReviewStatus: countKnown(actuatorReview, [...SIMULATION_REVIEW_STATUSES, "missing"]),
        groups: {
          total: actuatorGroups.length,
          withDrive: actuatorGroups.filter((group) => nonEmptyValue(group && group.drive)).length,
          withTransmission: actuatorGroups.filter((group) => nonEmptyValue(group && group.transmission)).length,
          withMotion: actuatorGroups.filter((group) => nonEmptyValue(group && group.motion)).length,
          withArchitecture: actuatorGroups.filter((group) => nonEmptyValue(group && group.architecture)).length,
          unknown: actuatorGroups.filter((group) => !groupFields.some((key) => nonEmptyValue(group && group[key]))).length,
        },
      },
      dataGaps: {
        robotsWithoutHandDof: quality.missing.robotsWithoutHandDof,
        robotsWithoutFingersPerHand: quality.missing.robotsWithoutFingersPerHand,
        robotsWithoutSimulation: quality.missing.robotsWithoutSimulation,
        robotsWithoutActuatorArchitecture: quality.missing.robotsWithoutActuatorArchitecture,
        capabilityRecordsWithoutSourceMediaType: quality.missing.capabilityRecordsWithoutSourceMediaType,
        capabilityRecordsWithoutTimestamp: quality.missing.capabilityRecordsWithoutTimestamp,
      },
    },
  };
}

function renderMarkdown(factsheet) {
  const m = factsheet.metrics;
  const capability = m.capabilityRecords;
  const review = m.claimSourceRecords.reviewStatus;
  const media = m.claimSourceRecords.mediaType;
  const simulation = m.simulation;
  const actuator = m.actuatorArchitecture;
  const gaps = m.dataGaps;
  const lines = [
    "# Humanoid Record factsheet",
    "",
    `Cutoff: ${factsheet.cutoff}`,
    "",
    factsheet.scope.statement,
    "",
    factsheet.scope.unitWarning,
    "",
    "## Register counts",
    "",
    `- Robot records: ${m.robotRecords.total}`,
    `- Robot records with one or more capability records: ${m.robotRecords.withCapabilities}`,
    `- Capability records: ${capability.total}`,
    `- Capability status (denominator ${capability.total} records): claimed ${capability.status.claimed}, demonstrated ${capability.status.demonstrated}, shipped ${capability.status.shipped}, unknown ${capability.status.unknown}`,
    `- Capability autonomy (denominator ${capability.total} records): autonomous ${capability.autonomy.autonomous}, teleoperated ${capability.autonomy.teleoperated}, scripted ${capability.autonomy.scripted}, unknown ${capability.autonomy.unknown}`,
    "",
    factsheet.scope.videoAssessment,
    "",
    "## Claim-source review",
    "",
    `- Claim-source records: ${m.claimSourceRecords.total}`,
    `- Review status (denominator ${m.claimSourceRecords.total} claim-source records): supported ${review.supported}, insufficient ${review.insufficient}, inaccessible ${review.inaccessible}, conflicting ${review.conflicting}, unreviewed ${review.unreviewed}, unknown or missing ${review.unknown}`,
    `- Source media type (same denominator): video ${media.video}, non-video ${media.non_video}, unknown or missing ${media.unknown}`,
    `- Claims queued for review: ${m.claimSourceRecords.queuedForReview}`,
    "",
    "## Simulation and actuators",
    "",
    `- Simulation review (denominator ${m.robotRecords.total} robot records): found ${simulation.robotReviewStatus.found}, not confirmed ${simulation.robotReviewStatus.not_confirmed}, missing ${simulation.robotReviewStatus.missing}, unknown ${simulation.robotReviewStatus.unknown}`,
    `- Simulation artifacts: ${simulation.artifacts}`,
    `- Simulator compatibility statements: documented ${simulation.compatibility.documented}, tested ${simulation.compatibility.tested}, unknown ${simulation.compatibility.unknown}`,
    `- Actuator review (denominator ${m.robotRecords.total} robot records): found ${actuator.robotReviewStatus.found}, not confirmed ${actuator.robotReviewStatus.not_confirmed}, missing ${actuator.robotReviewStatus.missing}, unknown ${actuator.robotReviewStatus.unknown}`,
    `- Actuator groups: ${actuator.groups.total}; drive known ${actuator.groups.withDrive}, transmission known ${actuator.groups.withTransmission}, motion known ${actuator.groups.withMotion}, architecture known ${actuator.groups.withArchitecture}, all four unknown ${actuator.groups.unknown}`,
    "",
    "## Recorded gaps",
    "",
    `- Robot records without hand DoF: ${gaps.robotsWithoutHandDof}`,
    `- Robot records without fingers per hand: ${gaps.robotsWithoutFingersPerHand}`,
    `- Robot records without simulation review: ${gaps.robotsWithoutSimulation}`,
    `- Robot records without actuator architecture review: ${gaps.robotsWithoutActuatorArchitecture}`,
    `- Capability records without explicit source media type: ${gaps.capabilityRecordsWithoutSourceMediaType}`,
    `- Capability records without source timestamp: ${gaps.capabilityRecordsWithoutTimestamp}`,
    "",
    "## Reproduction metadata",
    "",
    `- Data schema: ${factsheet.dataSchemaVersion}`,
    `- Definitions: ${factsheet.definitionsVersion}`,
    `- Dataset SHA-256: ${factsheet.provenance.datasetSha256}`,
    `- Dataset Git commit: ${factsheet.provenance.dataGitHead}`,
    `- Generator SHA-256: ${factsheet.provenance.generatorSha256}`,
    ...factsheet.provenance.generatorFiles.map((file) => `- Generator file: ${file.path} (${file.sha256})`),
    "",
  ];
  return lines.join("\n");
}

function robotMap(snapshot) {
  return new Map(robotsFromFiles(snapshot.rawFiles).map((entry) => [entry.path, entry]));
}

function timelineEvents(robot) {
  const events = robot && robot.delivery && Array.isArray(robot.delivery.timeline) ? robot.delivery.timeline : [];
  return events.map((record) => ({
    identity: {
      date: record && record.date !== undefined ? record.date : null,
      event: record && record.event !== undefined ? record.event : null,
      detail: record && record.detail !== undefined ? record.detail : null,
    },
    record,
  }));
}

function eventKey(pathName, event) {
  return JSON.stringify([pathName, event.date, event.event, event.detail]);
}

function withoutTimeline(robot) {
  const copy = JSON.parse(JSON.stringify(robot));
  if (copy.delivery && typeof copy.delivery === "object") delete copy.delivery.timeline;
  return copy;
}

function compareSnapshots(before, after) {
  validateSnapshot(before);
  validateSnapshot(after);
  if (before.dataSchemaVersion !== after.dataSchemaVersion) {
    throw new Error("cannot compare snapshots with different dataSchemaVersion values");
  }
  if (before.definitionsVersion !== after.definitionsVersion) {
    throw new Error("cannot compare snapshots with different definitionsVersion values");
  }
  const beforeRobots = robotMap(before);
  const afterRobots = robotMap(after);
  const allRobotPaths = [...new Set([...beforeRobots.keys(), ...afterRobots.keys()])].sort(compareText);
  const additions = allRobotPaths.filter((entry) => !beforeRobots.has(entry));
  const removals = allRobotPaths.filter((entry) => !afterRobots.has(entry));
  const edits = allRobotPaths.filter((entry) => beforeRobots.has(entry) && afterRobots.has(entry) &&
    beforeRobots.get(entry).raw !== afterRobots.get(entry).raw);

  const beforeEvents = new Map();
  const afterEvents = new Map();
  for (const [pathName, entry] of beforeRobots) {
    for (const item of timelineEvents(entry.robot)) beforeEvents.set(eventKey(pathName, item.identity), {
      identity: { path: pathName, ...item.identity }, record: item.record,
    });
  }
  for (const [pathName, entry] of afterRobots) {
    for (const item of timelineEvents(entry.robot)) afterEvents.set(eventKey(pathName, item.identity), {
      identity: { path: pathName, ...item.identity }, record: item.record,
    });
  }
  const addedEvents = [...afterEvents].filter(([key]) => !beforeEvents.has(key)).map(([, value]) => value.identity);
  const removedEvents = [...beforeEvents].filter(([key]) => !afterEvents.has(key)).map(([, value]) => value.identity);
  const eventSort = (a, b) => compareText(JSON.stringify([a.path, a.date, a.event, a.detail]), JSON.stringify([b.path, b.date, b.event, b.detail]));

  const commonEventRecordChanged = new Set([...beforeEvents]
    .filter(([key, value]) => afterEvents.has(key) && JSON.stringify(value.record) !== JSON.stringify(afterEvents.get(key).record))
    .map(([, value]) => value.identity.path));
  const otherRecordEdits = edits.filter((pathName) =>
    JSON.stringify(withoutTimeline(beforeRobots.get(pathName).robot)) !==
    JSON.stringify(withoutTimeline(afterRobots.get(pathName).robot)) || commonEventRecordChanged.has(pathName));
  const beforeOther = new Map(before.rawFiles.filter((file) => !/^data\/robots\/[^/]+\.json$/.test(file.path)).map((file) => [file.path, file.raw]));
  const afterOther = new Map(after.rawFiles.filter((file) => !/^data\/robots\/[^/]+\.json$/.test(file.path)).map((file) => [file.path, file.raw]));
  const otherPaths = [...new Set([...beforeOther.keys(), ...afterOther.keys()])].sort(compareText);

  return {
    statement: "These are data changes between register snapshots, not automatically real-world events.",
    records: { additions, removals, edits },
    deliveryTimelineEvents: {
      identity: "robot record path + date + event + detail",
      additions: addedEvents.sort(eventSort),
      removals: removedEvents.sort(eventSort),
    },
    otherDataChanges: {
      robotRecordEdits: otherRecordEdits,
      files: {
        additions: otherPaths.filter((entry) => !beforeOther.has(entry)),
        removals: otherPaths.filter((entry) => !afterOther.has(entry)),
        edits: otherPaths.filter((entry) => beforeOther.has(entry) && afterOther.has(entry) && beforeOther.get(entry) !== afterOther.get(entry)),
      },
    },
  };
}

function parseArgs(argv) {
  let snapshotPath = "";
  let output = "";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--snapshot") snapshotPath = argv[++index] || "";
    else if (argv[index].startsWith("--snapshot=")) snapshotPath = argv[index].slice(11);
    else if (argv[index] === "--output") output = argv[++index] || "";
    else if (argv[index].startsWith("--output=")) output = argv[index].slice(9);
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (!snapshotPath || !output) throw new Error("--snapshot and --output are required");
  return { snapshotPath, output };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const snapshot = JSON.parse(fs.readFileSync(path.resolve(args.snapshotPath), "utf8"));
  validateSnapshot(snapshot);
  validateRuntimeGenerator(snapshot);
  const factsheet = buildFactsheet(snapshot);
  const outputDir = path.resolve(args.output);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "factsheet.json"), `${JSON.stringify(factsheet, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "factsheet.md"), renderMarkdown(factsheet));
  process.stdout.write(`${outputDir}\n`);
  return factsheet;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`factsheet: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFINITIONS_VERSION,
  REQUIRED_GENERATOR_FILES,
  buildFactsheet,
  compareSnapshots,
  createSnapshot,
  main,
  parseArgs,
  renderMarkdown,
  validateRuntimeGenerator,
  validateSnapshot,
};
