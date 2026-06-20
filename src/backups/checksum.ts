import { createHash } from "node:crypto";
import { createReadStream, writeFileSync } from "node:fs";
import { basename } from "node:path";

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

export function writeSha256Sidecar(input: { filePath: string; sha256: string }): string {
  const checksumPath = `${input.filePath}.sha256`;
  writeFileSync(checksumPath, `${input.sha256}  ${basename(input.filePath)}\n`, "utf8");
  return checksumPath;
}
