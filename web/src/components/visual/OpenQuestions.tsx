"use client";

/**
 * OpenQuestions (VISUI-007) — list of open questions, each with a small
 * source chip (first sourceRef quote, truncated ~80 chars, full quote in the
 * title attribute). No outer card surface: architecture §7.1 renders this
 * INLINE inside DecisionBrief (it has no TipTap node of its own); the preview
 * route wraps it in its own labeled section for standalone QA.
 */

import type { OpenQuestionsBlock } from "htmlcollab-app/visual";
import { EmptyState, pickNodes, SourceChip, type SemanticNodeMap } from "./shared";

export interface OpenQuestionsProps {
  block: OpenQuestionsBlock;
  nodes: SemanticNodeMap;
}

export default function OpenQuestions({ block, nodes }: OpenQuestionsProps) {
  const questions = pickNodes(block.questionIds, nodes, "question");

  if (!questions.length) {
    return <EmptyState text="No open questions." />;
  }

  return (
    <div className="dr-open-questions" data-visual-block-id={block.id}>
      <p className="dr-label">{block.title}</p>
      <ul className="dr-list">
        {questions.map((q) => (
          <li key={q.id} className="dr-question-row" data-semantic-node-id={q.id}>
            <span className="dr-question-text">{q.title}</span>
            <SourceChip sourceRefs={q.sourceRefs} />
          </li>
        ))}
      </ul>
    </div>
  );
}
