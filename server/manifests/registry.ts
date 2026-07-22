import season2013 from "../../config/seasons/2013.json";
import season2014 from "../../config/seasons/2014.json";
import season2015 from "../../config/seasons/2015.json";
import season2016 from "../../config/seasons/2016.json";
import season2017 from "../../config/seasons/2017.json";
import season2018 from "../../config/seasons/2018.json";
import season2019 from "../../config/seasons/2019.json";
import season2020 from "../../config/seasons/2020.json";
import season2021 from "../../config/seasons/2021.json";
import season2022 from "../../config/seasons/2022.json";
import season2023 from "../../config/seasons/2023.json";
import season2024 from "../../config/seasons/2024.json";
import season2025 from "../../config/seasons/2025.json";
import season2026 from "../../config/seasons/2026.json";
import { validateManifestSet } from "./schema";

export const seasonManifests = validateManifestSet([
  season2013,
  season2014,
  season2015,
  season2016,
  season2017,
  season2018,
  season2019,
  season2020,
  season2021,
  season2022,
  season2023,
  season2024,
  season2025,
  season2026,
]);

export function getSeasonManifest(year: number) {
  return seasonManifests.find((manifest) => manifest.year === year);
}

export function getActiveSeasonManifest() {
  return seasonManifests.find(
    (manifest) =>
      manifest.status === "in_season" || manifest.status === "pre_draft",
  );
}
