import { evidenceIsWeak } from "../services/retrieval.js";
import { isFollowUpFragment } from "../services/pipeline.js";
import { normalizeQuestion, scoreChunks } from "../services/retrieval.js";

const chunks = [
  {
    documentId: "scholarship",
    filename: "Scholarship_Rules.pdf",
    pageNumber: 1,
    content:
      "The Merit Scholarship is available to undergraduate students in year 2 or later. Applicants must have a minimum GPA of 3.5. The Student Finance Office hours are Monday to Friday, 9:00 to 16:00.",
  },
  {
    documentId: "housing",
    filename: "Housing_Policy.pdf",
    pageNumber: 1,
    content: "Quiet hours are 22:00 to 07:00. Pets are not allowed except registered assistance animals. Housing applications open on 1 April.",
  },
];

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const hours = scoreChunks(chunks, "What are the Student Finance Office hours?");
assert(hours[0]?.filename === "Scholarship_Rules.pdf", "office hours should hit the scholarship document");
assert(!evidenceIsWeak(hours), "office hours evidence should clear the support threshold");

const parking = scoreChunks(chunks, "What is the refund policy for parking permits?");
assert(parking.length === 0 || evidenceIsWeak(parking), "parking permits are not in the knowledge base");

const probationChunks = [
  ...chunks,
  {
    documentId: "hr",
    filename: "HR_Policy.pdf",
    pageNumber: 4,
    content: "The probation period is six months. A probationary employee must give 30 days notice.",
  },
];

const glued = scoreChunks(probationChunks, "probationperiod");
assert(glued[0]?.filename === "HR_Policy.pdf", "missing space should still find probation period");
assert(!evidenceIsWeak(glued), "glued probation period should clear the support threshold");

const gluedSentence = scoreChunks(probationChunks, "whatisprobationperiod");
assert(gluedSentence[0]?.filename === "HR_Policy.pdf", "glued question should still find probation period");

const typo = scoreChunks(probationChunks, "probaton period");
assert(typo[0]?.filename === "HR_Policy.pdf", "one-character typo should still find probation period");

const hyphen = scoreChunks(probationChunks, "probation-period");
assert(hyphen[0]?.filename === "HR_Policy.pdf", "hyphenated probation-period should still match");

const withNumber = scoreChunks(probationChunks, "30daysnotice");
assert(withNumber[0]?.filename === "HR_Policy.pdf", "number glued to words should still find the notice rule");

const pets = scoreChunks(chunks, "Are pets allowed in residences?");
assert(pets[0]?.filename === "Housing_Policy.pdf", "pets should hit the housing document");
assert(!pets.some((hit) => hit.filename === "Scholarship_Rules.pdf" && hit.score >= (pets[0]?.score || 0)), "pets query should rank housing first");

const hr = [
  {
    documentId: "hr",
    filename: "HR_Policy.pdf",
    pageNumber: 1,
    content: "The start date is the first working day. The probation period is six months.",
  },
];
assert(normalizeQuestion("staff date", hr) === "staff date", "staff must not be rewritten to start");
assert(normalizeQuestion("probaton period", hr) === "probation period", "a one-character typo should still be repaired");
assert(!isFollowUpFragment("and what is the leave policy"), "a new question must not be treated as a follow-up");
assert(isFollowUpFragment("yes"), "yes is a follow-up");
assert(isFollowUpFragment("3.7"), "a bare number is a follow-up");
assert(!isFollowUpFragment("What is the probation period?"), "a full question is not a follow-up");

console.log("PASS: retrieval ranking");
