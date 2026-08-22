import { getPublicExamFormatGuidance } from "./admissions.service";

describe("public examination format guidance", () => {
  it("describes WAEC identifiers and school/private categories", () => {
    const school = getPublicExamFormatGuidance(
      "WAEC",
      "WASSCE_SCHOOL",
      "School Candidate",
    );
    const privateCandidate = getPublicExamFormatGuidance(
      "WAEC",
      "WASSCE_PRIVATE",
      "Private Candidate",
    );

    expect(school.candidateCategories).toEqual(["School Candidate"]);
    expect(privateCandidate.candidateCategories).toEqual([
      "Private Candidate",
    ]);
    expect(school.examinationNumber.inputMode).toBe("numeric");
    expect(school.examinationNumber.format).toContain("10 digits");
    expect(school.centreNumber.format).toContain("7 digits");
  });

  it("uses the persisted candidate label for supported non-WAEC types", () => {
    const neco = getPublicExamFormatGuidance(
      "NECO",
      "SSCE_EXTERNAL",
      "External / Private Candidate",
    );

    expect(neco.candidateCategories).toEqual(["External / Private Candidate"]);
    expect(neco.examinationNumber.format).toBe(
      "As printed on the result or certificate",
    );
    expect(neco.examinationNumber.inputMode).toBe("text");
  });

  it("falls back safely for future reference types", () => {
    const futureType = getPublicExamFormatGuidance(
      "FUTURE_AUTHORITY",
      "FUTURE_TYPE",
      "Future candidate",
    );

    expect(futureType.candidateCategories).toEqual(["Future candidate"]);
    expect(futureType.candidateNumber.placeholder).toBe(
      "As printed on the result",
    );
    expect(futureType.centreNumber.hint).toContain("leading zeroes");
  });
});

export {};
