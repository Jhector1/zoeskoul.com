#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const files = [
  "authoring/subjects/python/courses/applied-python-projects/course.spec.json",
  "authoring/subjects/python/courses/applied-python-projects/course.plan.json",
];

const steps = [
  {
    step: 1,
    title: "Build the Shared Request Foundation",
    requirement:
      "The pantry is replacing paper notes. Build PantryRequest as an ABC with validated shared state, abstract category/details members, and a concrete summary(), then implement and export FoodRequest and keep main.py runnable.",
  },
  {
    step: 2,
    title: "Add Hygiene Requests and Prove Polymorphism",
    requirement:
      "Add and export HygieneRequest, validate units, then process FoodRequest and HygieneRequest together in one loop through request.summary() without type-specific branches.",
  },
  {
    step: 3,
    title: "Give PantryService Ownership of the Queue",
    requirement:
      "Encapsulate the mixed collection in PantryService, expose a read-only view, validate additions, delegate fulfillment, count open requests, and produce polymorphic summary lines while main.py stays focused on orchestration.",
  },
  {
    step: 4,
    title: "Load Saved Requests Back into Domain Objects",
    requirement:
      "Read data/requests.csv with DictReader, restore fulfillment state, construct the correct validated subclass for each row, and return domain objects that continue to work through the shared interface.",
  },
  {
    step: 5,
    title: "Create the Daily Report and Protect the Design with Tests",
    requirement:
      "Build a type-agnostic report with deterministic totals and regression checks for the abstract contract, validation failures, mixed subclasses, service delegation, summaries, and open counts.",
  },
  {
    step: 6,
    title: "Deliver the Coordinator to the Pantry Team",
    requirement:
      "Document the OOP design and run command, execute regression checks, complete the final service workflow, print the deterministic report, and end with PANTRY REQUEST COORDINATOR READY.",
  },
];

function findCapstoneModule(doc) {
  const modules = Array.isArray(doc.modules) ? doc.modules : [];
  return modules.find(
    (module) =>
      module?.role === "capstone" ||
      module?.prefix === "py11" ||
      module?.moduleSlug === "python-11-oop-capstone-project",
  );
}

function findCapstoneTopic(module) {
  for (const section of module?.sections ?? []) {
    for (const topic of section?.topics ?? []) {
      if (topic?.topicId === "module-11-final-oop-capstone") return topic;
    }
  }
  return null;
}

for (const relativePath of files) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) continue;

  const doc = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  const module = findCapstoneModule(doc);
  const topic = findCapstoneTopic(module);
  if (!module || !topic || !topic.projectBrief) {
    throw new Error(`Could not locate the Applied Python capstone projectBrief in ${relativePath}`);
  }

  module.description =
    "Deliver one story-driven OOP capstone that moves from an abstract request contract to a tested, documented neighborhood-pantry handoff.";
  topic.summary =
    "Build a neighborhood pantry application through six clearly scoped milestones, from one abstract request contract to a tested and documented final handoff.";
  topic.projectBrief.scenario =
    "A neighborhood pantry is replacing paper request notes with one dependable application. Staff need food and hygiene requests to share one contract, survive CSV storage, move through one protected service queue, and produce a clear daily handoff report.";
  topic.projectBrief.deliverable =
    "One cumulative six-step Neighborhood Pantry Request Coordinator with an abstract PantryRequest contract, validated FoodRequest and HygieneRequest subclasses, polymorphic service and report behavior, CSV restoration, regression tests, deterministic output, and a README another volunteer can follow.";
  topic.projectBrief.stepLadder = steps;

  fs.writeFileSync(absolutePath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`Updated ${relativePath}`);
}
