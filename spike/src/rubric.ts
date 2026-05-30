// Fidelity rubric — the checkable criteria the judge applies (PRD P1-T1 Tests).
// DOC-AGNOSTIC: no document type is assumed. Criteria measure whether the artifact
// surfaces THIS document's own load-bearing point and structures it for reading,
// whatever the document is. (a)/(b) graded; (c)/(d) zero-tolerance on the high-stakes subset.

export const RUBRIC_VERSION = "rubric-v2-docagnostic";

export type CriterionId =
  | "a_lead_surfaced"
  | "b_structure_aids_comprehension"
  | "c_no_emphasis_inversion"
  | "d_no_fabrication_omission";

export interface Criterion {
  id: CriterionId;
  title: string;
  zeroTolerance: boolean;
  question: string; // what the judge must decide
}

export const CRITERIA: Criterion[] = [
  {
    id: "a_lead_surfaced",
    title: "Load-bearing point surfaced",
    zeroTolerance: false,
    question:
      "Whatever this document is, is its single most load-bearing point/purpose surfaced prominently at the top (above the fold / in the summary), stated plainly? If the source buries it, was it lifted to the top?",
  },
  {
    id: "b_structure_aids_comprehension",
    title: "Structure reduces reading cost",
    zeroTolerance: false,
    question:
      "Does the artifact's structure (hierarchy, grouping, progressive disclosure, anchored navigation) measurably reduce reading cost versus the flat source — i.e. a reader can get the gist fast and drill down on demand?",
  },
  {
    id: "c_no_emphasis_inversion",
    title: "No emphasis inversion",
    zeroTolerance: true,
    question:
      "Confirm NO minor point is rendered more prominently than the document's main point. A failure is any case where a secondary point is given top-level prominence over the load-bearing one.",
  },
  {
    id: "d_no_fabrication_omission",
    title: "No fabrication or omission of material points",
    zeroTolerance: true,
    question:
      "Confirm the artifact neither fabricates content absent from the source NOR omits any material point present in the source.",
  },
];

// Phase-gate thresholds (PRD P1-T1).
export const THRESHOLDS = {
  // graded criteria must pass on >= 80% of the golden set
  gradedPassRate: 0.8,
  gradedCriteria: ["a_lead_surfaced", "b_structure_aids_comprehension"] as CriterionId[],
  // zero-tolerance criteria must pass on 100% of the high-stakes subset
  zeroToleranceCriteria: ["c_no_emphasis_inversion", "d_no_fabrication_omission"] as CriterionId[],
};
