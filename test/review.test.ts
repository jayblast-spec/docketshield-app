import assert from "node:assert/strict";
import { test } from "node:test";
import { isFultonCounty, fieldsRequiringReview } from "../src/lib/review.ts";

test("Fulton routing accepts normalized county names and rejects other or missing counties", () => {
  for (const name of ["Fulton", " fUlToN County "]) assert.equal(isFultonCounty(name), true);
  for (const name of ["DeKalb", "Cobb", "", "Atlanta", "Fulton County, Georgia", "Not Fulton"]) assert.equal(isFultonCounty(name), false);
});

test("every extracted field requires explicit review, including high-confidence values and blanks", () => {
  const fields = ["serviceDate", "county", "printedAnswerDeadline"];
  assert.deepEqual(fieldsRequiringReview(fields, new Set()), fields);
  assert.deepEqual(fieldsRequiringReview(fields, new Set(["serviceDate"])), ["county", "printedAnswerDeadline"]);
  assert.deepEqual(fieldsRequiringReview(fields, new Set(fields)), []);
});

test("editing an already reviewed field makes it require confirmation again", () => {
  const confirmed = new Set(["county", "serviceDate"]);
  confirmed.delete("serviceDate");
  assert.deepEqual(fieldsRequiringReview(["county", "serviceDate"], confirmed), ["serviceDate"]);
});
