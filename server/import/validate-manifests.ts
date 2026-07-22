import { seasonManifests } from "../manifests/registry";

console.log(
  `Validated ${seasonManifests.length} season manifests (${seasonManifests[0]?.year}–${seasonManifests.at(-1)?.year}).`,
);
