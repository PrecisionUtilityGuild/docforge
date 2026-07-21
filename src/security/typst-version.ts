import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TYPST_BIN, TYPST_VERSION_PIN } from "../config.js";

const execFileAsync = promisify(execFile);

export async function assertTypstVersionPin(): Promise<string> {
  const { stdout } = await execFileAsync(TYPST_BIN, ["--version"]);
  const version = stdout.trim();
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Typst version could not be parsed: ${version}`);
  }

  const [, major, minor] = match;
  const pinMatch = TYPST_VERSION_PIN.match(/(\d+)\.(\d+)/);
  if (!pinMatch) {
    throw new Error(`Invalid TYPST_VERSION_PIN: ${TYPST_VERSION_PIN}`);
  }

  const minMajor = Number(pinMatch[1]);
  const minMinor = Number(pinMatch[2]);
  if (Number(major) < minMajor || (Number(major) === minMajor && Number(minor) < minMinor)) {
    throw new Error(
      `Typst ${version} is below required ${TYPST_VERSION_PIN}. Install Typst ${TYPST_VERSION_PIN}+.`,
    );
  }

  return version;
}
