import {
  localKnowledgeNegativeRegressionCases,
  localKnowledgeRegressionCases,
  lookupLocalKnowledge
} from "@voiceassistant/shared";

interface Failure {
  query: string;
  expected: string;
  actual: string;
}

const failures: Failure[] = [];
let passed = 0;

for (const regressionCase of localKnowledgeRegressionCases) {
  const result = lookupLocalKnowledge(regressionCase.query);
  const bestMatch = result.bestMatch;
  const expected = regressionCase.expectedCardId
    ? `card ${regressionCase.expectedCardId}`
    : `category ${regressionCase.expectedCategory}`;
  const cardMatches = regressionCase.expectedCardId
    ? bestMatch?.id === regressionCase.expectedCardId
    : bestMatch?.category === regressionCase.expectedCategory;
  const commandMatches = !regressionCase.expectedCommandFragment
    || bestMatch?.commands.some((command) => command.toLowerCase().includes(regressionCase.expectedCommandFragment!.toLowerCase()));

  if (cardMatches && commandMatches) {
    passed += 1;
    continue;
  }

  failures.push({
    query: regressionCase.query,
    expected: regressionCase.expectedCommandFragment
      ? `${expected}, command containing ${regressionCase.expectedCommandFragment}`
      : expected,
    actual: bestMatch
      ? `card ${bestMatch.id} (${bestMatch.category})`
      : "no local match"
  });
}

for (const query of localKnowledgeNegativeRegressionCases) {
  const result = lookupLocalKnowledge(query);
  if (!result.bestMatch) {
    passed += 1;
    continue;
  }

  failures.push({
    query,
    expected: "no local match",
    actual: `card ${result.bestMatch.id} (${result.bestMatch.category})`
  });
}

const total = localKnowledgeRegressionCases.length + localKnowledgeNegativeRegressionCases.length;

console.log("Local knowledge regression summary");
console.log(`  Total:  ${total}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failures.length}`);

if (failures.length > 0) {
  console.log("");
  console.log("Failures:");
  failures.forEach((failure, index) => {
    console.log(`  ${index + 1}. ${failure.query}`);
    console.log(`     Expected: ${failure.expected}`);
    console.log(`     Actual:   ${failure.actual}`);
  });
  process.exitCode = 1;
}
