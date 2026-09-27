#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_MEDIA_TYPES = ["article", "video", "paper", "repository", "documentation", "unknown"];
const NON_VIDEO_SOURCE_MEDIA_TYPES = new Set(["article", "paper", "repository", "documentation"]);
const REVIEW_PROBLEM_STATUSES = new Set(["insufficient", "inaccessible", "conflicting"]);
const ROBOT_MEDIA_TYPES = ["photo", "drawing", "patent"];

function byPath(a, b) {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

function datasetSha256(rawFiles) {
  const framed = [...rawFiles]
    .sort(byPath)
    .map((file) => [file.path, file.raw]);
  return crypto.createHash("sha256").update(JSON.stringify(framed), "utf8").digest("hex");
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

function isCalendarDate(value) {
  if (!DATE_RE.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function sourceMediaBucket(value) {
  if (value === "video") return "video";
  if (NON_VIDEO_SOURCE_MEDIA_TYPES.has(value)) return "non_video";
  return "unknown";
}

function escapePointerPart(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function sourceReviewQueue(robots) {
  const queue = [];
  for (const robot of [...robots].sort((a, b) => String(a.slug).localeCompare(String(b.slug)))) {
    const visit = (value, pathParts) => {
      if (!value || typeof value !== "object") return;
      if (!Array.isArray(value) && value.source && typeof value.source === "object") {
        const source = value.source;
        const review = source.review;
        const reasons = [];
        if (!SOURCE_MEDIA_TYPES.includes(source.media_type)) reasons.push({ code: "missing_media_type" });
        if (source.publisher_type === undefined) reasons.push({ code: "missing_publisher_type" });
        if (!review || typeof review !== "object" || Array.isArray(review)) {
          reasons.push({ code: "missing_review" });
        } else if (review.status === "unreviewed") {
          reasons.push({ code: "unreviewed" });
        } else if (REVIEW_PROBLEM_STATUSES.has(review.status)) {
          reasons.push({ code: review.status, reason: review.reason });
        }
        if (value.status === "demonstrated" && source.media_type === "video" &&
            !(review && review.status === "supported" && review.method === "video" && source.timestamp)) {
          reasons.push({ code: "demonstrated_video_without_reviewed_segment" });
        }
        if (reasons.length > 0) {
          queue.push({
            robot: String(robot.slug || ""),
            pointer: `/${[...pathParts, "source"].map(escapePointerPart).join("/")}`,
            url: typeof source.url === "string" && source.url ? source.url : `/robots/${encodeURIComponent(String(robot.slug || ""))}/`,
            reasons,
          });
        }
      }
      for (const key of Object.keys(value).sort()) {
        if (key === "source" || pathParts[0] === "media") continue;
        visit(value[key], [...pathParts, key]);
      }
    };
    visit(robot, []);
  }
  return queue.sort((a, b) => a.robot.localeCompare(b.robot) || a.pointer.localeCompare(b.pointer));
}

function maintenanceReviewQueue(robots) {
  const queue = sourceReviewQueue(robots).map((item) => ({
    ...item,
    category: "source",
  }));
  const fields = ["actuator_architecture", "simulation"];

  for (const robot of [...robots].sort((a, b) => String(a.slug).localeCompare(String(b.slug)))) {
    for (const field of fields) {
      const value = robot && robot[field];
      const reviewUrl = value && value.review && Array.isArray(value.review.urls) &&
        typeof value.review.urls[0] === "string" ? value.review.urls[0] : null;
      const robotUrl = `/robots/${encodeURIComponent(String(robot.slug || ""))}/`;
      if (value === undefined) {
        queue.push({
          robot: String(robot.slug || ""),
          pointer: `/${field}`,
          url: robotUrl,
          category: field,
          reasons: [{ code: `${field}_missing` }],
        });
      } else if (value && typeof value === "object" && value.review &&
                 value.review.status === "not_confirmed") {
        queue.push({
          robot: String(robot.slug || ""),
          pointer: `/${field}/review`,
          url: reviewUrl || robotUrl,
          category: field,
          reasons: [{ code: `${field}_not_confirmed` }],
        });
      }
    }
  }

  const unique = new Map();
  for (const item of queue) {
    const key = `${item.robot}\0${item.pointer}\0${item.category}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) =>
    a.robot.localeCompare(b.robot) ||
    a.pointer.localeCompare(b.pointer) ||
    a.category.localeCompare(b.category)
  );
}

function hasSpec(robot, key) {
  return Boolean(robot && robot.specs && robot.specs[key] !== undefined);
}

function buildQualityReport({ rawFiles, asOf, code }) {
  if (!isCalendarDate(asOf)) {
    throw new Error("asOf is required and must be a calendar-valid YYYY-MM-DD");
  }
  if (!code || typeof code.gitHead !== "string" || !code.gitHead.trim() ||
      typeof code.generatorSha256 !== "string" || !/^[a-f0-9]{64}$/.test(code.generatorSha256) ||
      typeof code.dirty !== "boolean") {
    throw new Error("code.gitHead, code.generatorSha256 and code.dirty are required");
  }
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    throw new Error("rawFiles must contain the dataset and schema inputs");
  }

  const sortedFiles = [...rawFiles].sort(byPath);
  const robotFiles = sortedFiles.filter((file) => /^data\/robots\/[^/]+\.json$/.test(file.path));
  const robots = robotFiles.map((file) => JSON.parse(file.raw));
  const capabilities = robots.flatMap((robot) => Array.isArray(robot.capabilities) ? robot.capabilities : []);
  const media = robots.flatMap((robot) => Array.isArray(robot.media) ? robot.media : []);
  const mediaTypeOf = (capability) => sourceMediaBucket(capability && capability.source && capability.source.media_type);

  return {
    schemaVersion: 1,
    asOf,
    code: {
      gitHead: code.gitHead.trim(),
      generatorSha256: code.generatorSha256,
      dirty: code.dirty,
    },
    snapshot: {
      algorithm: "sha256",
      framing: "JSON array of [repository-relative path, raw UTF-8 content], sorted by path",
      sha256: datasetSha256(sortedFiles),
      files: sortedFiles.map((file) => file.path),
    },
    counts: {
      robots: {
        total: robots.length,
        withCapabilities: robots.filter((robot) => Array.isArray(robot.capabilities) && robot.capabilities.length > 0).length,
      },
      capabilityRecords: {
        total: capabilities.length,
        status: countKnown(capabilities.map((capability) => capability && capability.status), ["claimed", "demonstrated", "shipped"]),
        autonomy: countKnown(capabilities.map((capability) => capability && capability.autonomy), ["teleoperated", "scripted", "autonomous", "unknown"]),
        sourceMediaType: countKnown(capabilities.map(mediaTypeOf), ["video", "non_video"]),
      },
      media: {
        total: media.length,
        type: countKnown(media.map((entry) => entry && entry.type), ROBOT_MEDIA_TYPES),
      },
    },
    missing: {
      robotsWithoutCapabilities: robots.filter((robot) => !Array.isArray(robot.capabilities) || robot.capabilities.length === 0).length,
      capabilityRecordsWithoutSourceMediaType: capabilities.filter((capability) => {
        const value = capability && capability.source && capability.source.media_type;
        return !SOURCE_MEDIA_TYPES.includes(value);
      }).length,
      capabilityRecordsWithoutTimestamp: capabilities.filter((capability) => !(capability && capability.source && capability.source.timestamp)).length,
      robotsWithoutHandDof: robots.filter((robot) => !hasSpec(robot, "hand_dof")).length,
      robotsWithoutFingersPerHand: robots.filter((robot) => !hasSpec(robot, "fingers_per_hand")).length,
      robotsWithoutSimulation: robots.filter((robot) => robot.simulation === undefined).length,
      robotsWithoutActuatorArchitecture: robots.filter((robot) => robot.actuator_architecture === undefined).length,
    },
    sourceReviewQueue: sourceReviewQueue(robots),
    maintenanceReviewQueue: maintenanceReviewQueue(robots),
  };
}

function listSnapshotFiles(root = ROOT) {
  const relative = [];
  for (const dir of ["data/robots", "data/events"]) {
    for (const name of fs.readdirSync(path.join(root, dir)).filter((file) => file.endsWith(".json")).sort()) {
      relative.push(`${dir}/${name}`);
    }
  }
  relative.push("data/capabilities.json", "data/schema.md", "data/schema-version.json");
  return relative.sort().map((file) => ({
    path: file,
    raw: fs.readFileSync(path.join(root, file), "utf8"),
  }));
}

function parseArgs(argv) {
  let asOf = "";
  let output = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--as-of") asOf = argv[++i] || "";
    else if (argv[i].startsWith("--as-of=")) asOf = argv[i].slice(8);
    else if (argv[i] === "--output") output = argv[++i] || "";
    else if (argv[i].startsWith("--output=")) output = argv[i].slice(9);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!isCalendarDate(asOf)) throw new Error("--as-of must be a calendar-valid YYYY-MM-DD");
  return { asOf, output };
}

function main(argv = process.argv.slice(2)) {
  const { asOf, output } = parseArgs(argv);
  const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const generatorRaw = fs.readFileSync(__filename, "utf8");
  const code = {
    gitHead,
    generatorSha256: crypto.createHash("sha256").update(generatorRaw, "utf8").digest("hex"),
    dirty: Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()),
  };
  const report = buildQualityReport({ rawFiles: listSnapshotFiles(ROOT), asOf, code });
  const outputPath = output ? path.resolve(ROOT, output) : path.join(ROOT, "var", "quality", `quality-${asOf}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${outputPath}\n`);
  return report;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`data-quality: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildQualityReport,
  datasetSha256,
  isCalendarDate,
  listSnapshotFiles,
  parseArgs,
  maintenanceReviewQueue,
  sourceMediaBucket,
  sourceReviewQueue,
  main,
};
