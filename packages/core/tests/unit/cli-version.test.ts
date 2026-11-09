import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("CLI: Version Flag", () => {
  it("kerith --version outputs the version from package.json", () => {
    // Read the actual valid version from the package.json to test against
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const pkgJSON = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const expectedVersion = pkgJSON.version;

    const cliPath = path.resolve(__dirname, "../../src/cli/index.ts");
    const tsxPath = path.resolve(__dirname, "../../node_modules/.bin/tsx");
    const tsxCmd = process.platform === "win32" ? `"${tsxPath}.cmd"` : `"${tsxPath}"`;
    
    // Execute CLI passing the --version flag
    const output = execSync(`${tsxCmd} "${cliPath}" --version`, { encoding: "utf8" }).trim();
    
    expect(output).toBe(expectedVersion);
  }, 30000);
});
