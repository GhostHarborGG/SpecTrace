import { describe, expect, it } from "vitest";
import { tokenize, tokenizeFields } from "../src/retrieval/tokenizer.js";

describe("tokenize (spec §9.2)", () => {
  it("lowercases text", () => {
    expect(tokenize("EXPIRE")).toEqual(["expire"]);
  });

  it("splits camelCase", () => {
    expect(tokenize("expireInactiveSession")).toEqual(["expire", "inactive", "session"]);
  });

  it("splits PascalCase", () => {
    expect(tokenize("SessionManager")).toEqual(["session", "manager"]);
  });

  it("splits an acronym-then-word boundary in PascalCase", () => {
    expect(tokenize("HTTPServer")).toEqual(["http", "server"]);
  });

  it("splits snake_case", () => {
    expect(tokenize("expire_inactive_session")).toEqual(["expire", "inactive", "session"]);
  });

  it("splits kebab-case", () => {
    expect(tokenize("user-id-mapper")).toEqual(["user", "id", "mapper"]);
  });

  it("splits file paths", () => {
    expect(tokenize("src/auth/session.ts")).toEqual(["src", "auth", "session", "ts"]);
  });

  it("splits Windows-style file paths", () => {
    expect(tokenize("src\\auth\\session.ts")).toEqual(["src", "auth", "session", "ts"]);
  });

  it("preserves numbers attached to meaningful identifiers", () => {
    expect(tokenize("sha256Hash")).toEqual(["sha256", "hash"]);
    expect(tokenize("base64Encode")).toEqual(["base64", "encode"]);
    expect(tokenize("top-10")).toEqual(["top", "10"]);
  });

  it("removes punctuation", () => {
    expect(tokenize("SessionManager.expireInactive:method")).toEqual([
      "session",
      "manager",
      "expire",
      "inactive",
      "method"
    ]);
  });

  it("collapses repeated whitespace", () => {
    expect(tokenize("expire   inactive\t\tsession")).toEqual(["expire", "inactive", "session"]);
  });

  it("returns an empty array for empty or punctuation-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("...")).toEqual([]);
  });

  it("does not drop uncommon domain terms (no stopword list)", () => {
    expect(tokenize("the quick brown fox")).toEqual(["the", "quick", "brown", "fox"]);
  });
});

describe("tokenizeFields", () => {
  it("tokenizes multiple fields in order", () => {
    expect(tokenizeFields(["expireInactiveSession", "src/auth/session.ts"])).toEqual([
      "expire",
      "inactive",
      "session",
      "src",
      "auth",
      "session",
      "ts"
    ]);
  });
});
