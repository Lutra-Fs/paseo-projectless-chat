import { describe, expect, it } from "vitest";
import { chatFolderName, dayBucket, isChatFolderShape, messageSlug } from "../shared/folder-name";

describe("messageSlug", () => {
  it("keeps the first five ASCII words", () => {
    expect(messageSlug("Fix the CSV export when rows have commas, please")).toBe("fix-the-csv-export-when");
  });
  it("folds accents and drops punctuation", () => {
    expect(messageSlug("Café — résumé!!")).toBe("cafe-resume");
  });
  it("is empty for text without ASCII words", () => {
    expect(messageSlug("帮我整理一下会议纪要")).toBe("");
    expect(chatFolderName("帮我整理一下会议纪要", "k3f9a2b1")).toBe("k3f9a2b1");
  });
  it("keeps ASCII words mixed into other scripts", () => {
    expect(messageSlug("用 Python 写一个 CSV 解析器")).toBe("python-csv");
  });
  it("avoids Windows reserved names", () => {
    expect(messageSlug("CON")).toBe("con-chat");
  });
  it("caps the length", () => {
    expect(messageSlug("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe("shapes", () => {
  it("buckets by local day", () => {
    expect(dayBucket(new Date(2026, 10, 7, 23, 59))).toBe("2026-11-07");
  });
  it("recognises only folders this plugin makes", () => {
    expect(isChatFolderShape(["2026-11-07", "fix-csv-k3f9a2b1"])).toBe(true);
    expect(isChatFolderShape(["2026-11-07", "k3f9a2b1"])).toBe(true);
    expect(isChatFolderShape(["2026-11-07"])).toBe(false);
    expect(isChatFolderShape(["projects", "my-app"])).toBe(false);
    expect(isChatFolderShape(["2026-11-07", "k3f9a2b1", "src"])).toBe(false);
  });
});
