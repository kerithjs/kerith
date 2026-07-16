import fs from "node:fs";

// Helper for extracting version from package.json
const getKerithVersion = () => {
  const depths = [
    "../package.json",
    "../../package.json",
    "../../../package.json",
  ];
  for (const d of depths) {
    try {
      const p = new URL(d, import.meta.url);
      return JSON.parse(fs.readFileSync(p, "utf8")).version;
    } catch (_e) {
      /* not a valid package.json path, try next */
    }
  }
  return "unknown";
};

export const KERITH_VERSION = getKerithVersion();
