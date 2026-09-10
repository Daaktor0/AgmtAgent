import { readFileSync } from "node:fs";
import { analyzeProof } from "../launch.ts";

const path = process.argv[2];
if (!path) {
  process.stderr.write("missing_fixture_path\n");
  process.exit(2);
}
const result = await analyzeProof(readFileSync(path));
process.stdout.write(result.indexes.digest);
