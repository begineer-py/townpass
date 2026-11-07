import test from "node:test";
import assert from "node:assert/strict";
import { nearbyEntranceChoices } from "../src/entrance-choices.mjs";

const exit = (id, lat, lon) => ({ id, kind: "metro-elevator", lat, lon });

test("an already chosen elevator is not offered other entrances on that side", () => {
  const chosen = exit("chosen", 25.03336, 121.535601);
  const nearby = exit("nearby", 25.033337, 121.536211);
  const end = { lat: 25.035, lon: 121.536211 };
  const choices = nearbyEntranceChoices(chosen, end, [chosen, nearby]);
  assert.ok(choices.length > 0);
  assert.ok(choices.every(({ which }) => which === "end"));
  assert.deepEqual(nearbyEntranceChoices(chosen, nearby, [chosen, nearby]), []);
});

test("other endpoints still receive nearby distinct entrances in distance order", () => {
  const start = { lat: 25.0332, lon: 121.5355 };
  const a = exit("a", 25.03336, 121.535601);
  const sameEntrance = exit("duplicate", 25.03337, 121.535601);
  const b = exit("b", 25.033337, 121.536211);
  const far = exit("far", 25.04, 121.54);
  const choices = nearbyEntranceChoices(start, null, [far, b, sameEntrance, a]);
  assert.deepEqual(choices.map(({ which, p }) => [which, p.id]), [["start", "a"], ["start", "b"]]);
});

test("never recommends the other endpoint or a virtually identical entrance", () => {
  const start = exit("chosen", 25.03336, 121.535601);
  const end = {lat: 25.034, lon: 121.535601};
  const duplicate = exit("duplicate", 25.033361, 121.535601);
  const alternative = exit("other", 25.0342, 121.535601);
  assert.deepEqual(nearbyEntranceChoices(start, end, [start, duplicate, alternative]).map(({p}) => p.id), ["other"]);
});
