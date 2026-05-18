import { beforeEach, describe, expect, it, vi } from "vitest";

import fs from "fs";
import { filePath, generateRobotsTxt } from "../prebuild";

vi.spyOn(fs, "writeFileSync");

describe("robots.txt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("should generate production robots.txt", () => {
    const robotsProd = ["User-agent: *", "Allow: /"].join("\n");
    generateRobotsTxt(true);
    expect(fs.writeFileSync).toBeCalledWith(filePath, robotsProd);
  });
  it("should generate development robots.txt", () => {
    const robotsDev = ["User-agent: *", "Disallow: /"].join("\n");
    generateRobotsTxt(false);
    expect(fs.writeFileSync).toBeCalledWith(filePath, robotsDev);
  });
});
