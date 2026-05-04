import { conformanceChecklist } from "../src/conformance.js";

for (const section of ["17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7", "18.1"]) {
  if (!conformanceChecklist.some((entry) => entry.section === section)) {
    throw new Error(`No Northstar conformance mapping for section ${section}`);
  }
}
console.log(`Mapped ${conformanceChecklist.length} conformance sections.`);
