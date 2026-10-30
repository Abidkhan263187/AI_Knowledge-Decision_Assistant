import "dotenv/config";
import { closeMongo, connectMongo } from "../lib/mongo.js";
import { db } from "../lib/store.js";
import { retrieveForOrg } from "../services/retrieval.js";

async function main() {
  await connectMongo();
  const orgs = await db.allOrgsWithDocs();
  const a = orgs.find((org) => org.email === "admin@northridge.test");
  const b = orgs.find((org) => org.email === "admin@harbor.test");
  if (!a || !b) {
    throw new Error("Seed the Northridge and Harbor organizations before running isolation tests.");
  }
  const aHits = await retrieveForOrg(a.id, "merit scholarship GPA sports");
  const bHits = await retrieveForOrg(b.id, "merit scholarship GPA sports");
  const aFiles = new Set(aHits.map((h) => h.filename));
  const bFiles = new Set(bHits.map((h) => h.filename));
  const aOwns = new Set(a.documents.map((d) => d.filename));
  const bOwns = new Set(b.documents.map((d) => d.filename));

  const leakA = [...aFiles].filter((f) => !aOwns.has(f));
  const leakB = [...bFiles].filter((f) => !bOwns.has(f));

  console.log(`Org A ${a.name} documents: ${[...aOwns].join(", ") || "(none)"}`);
  console.log(`Org B ${b.name} documents: ${[...bOwns].join(", ") || "(none)"}`);
  console.log(`A retrieval files: ${[...aFiles].join(", ") || "(none)"}`);
  console.log(`B retrieval files: ${[...bFiles].join(", ") || "(none)"}`);

  if (a.id === b.id) throw new Error("Isolation failed: organizations share an id.");
  if (leakA.length || leakB.length) {
    throw new Error(`Isolation failed. A leaks ${leakA.join(", ")} B leaks ${leakB.join(", ")}`);
  }
  if (![...aOwns].some((f) => /scholarship/i.test(f))) {
    throw new Error("Isolation failed: Northridge is missing its scholarship documents.");
  }
  if ([...bFiles].some((f) => /scholarship/i.test(f)) && ![...bOwns].some((f) => /scholarship/i.test(f))) {
    throw new Error("Isolation failed: Org B retrieved scholarship content it does not own.");
  }
  if (aHits.length === 0) throw new Error("Isolation failed: Org A should retrieve scholarship chunks.");
  if (bHits.some((h) => /scholarship/i.test(h.content))) {
    throw new Error("Isolation failed: Org B retrieved scholarship text.");
  }
  console.log("PASS: retrieval is organization-scoped.");
}

main()
  .then(() => closeMongo())
  .catch(async (err) => {
    console.error(err);
    await closeMongo();
    process.exit(1);
  });
