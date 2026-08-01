import { readFileSync, writeFileSync } from "node:fs";

export function writeJsonLines(filePath: string, records: readonly unknown[]): void {
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  writeFileSync(filePath, records.length > 0 ? `${content}\n` : "", "utf8");
}

export function readJsonLines<T>(filePath: string): T[] {
  const content = readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}
