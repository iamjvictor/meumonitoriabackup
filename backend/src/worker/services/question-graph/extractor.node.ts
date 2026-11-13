import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { StructuredQuestionCandidate, StructuredQuestionExtractionService } from '../structured-question-extraction.service.js';

export type QuestionExtractorGraphState = {
  documentId: string;
  questions: StructuredQuestionCandidate[];
  llmCalls: number;
};

const ExtractorState = Annotation.Root({
  documentId: Annotation<string>,
  questions: Annotation<StructuredQuestionCandidate[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  llmCalls: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
});

export type QuestionExtractorNodeState = typeof ExtractorState.State;

export function createQuestionExtractorNode(service: Pick<StructuredQuestionExtractionService, 'extractCandidates'>) {
  return async (state: QuestionExtractorNodeState) => {
    const extraction = await service.extractCandidates(state.documentId);
    return { questions: extraction.questions, llmCalls: extraction.llmCalls };
  };
}

/** A one-node graph that returns the structured extraction for later graph stages. */
export function createQuestionExtractorGraph(service: Pick<StructuredQuestionExtractionService, 'extractCandidates'>) {
  return new StateGraph(ExtractorState)
    .addNode('extractor', createQuestionExtractorNode(service))
    .addEdge(START, 'extractor')
    .addEdge('extractor', END)
    .compile();
}

export type QuestionExtractorGraphResult = QuestionExtractorGraphState;
