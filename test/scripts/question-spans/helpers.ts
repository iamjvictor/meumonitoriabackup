import type {
  BoundingBox,
  LayoutDocument,
  LayoutElement,
  LayoutPage,
  VisualAsset,
} from '../../../backend/src/worker/services/document-parser/document-parser.types.js';

type ElementInput = Partial<LayoutElement> & Pick<LayoutElement, 'id' | 'pageNumber' | 'readingOrder' | 'category' | 'bbox'>;

type PageInput = {
  pageNumber: number;
  width?: number;
  height?: number;
  elements: ElementInput[];
};

type DocumentInput = {
  documentId: string;
  parseRunId?: string;
  pages: PageInput[];
  assets?: VisualAsset[];
  warnings?: string[];
};

export function box(x0: number, y0: number, x1: number, y1: number): BoundingBox {
  return { x0, y0, x1, y1, coordinateSpace: 'NORMALIZED_1000' };
}

export function element(input: ElementInput): LayoutElement {
  return {
    externalId: input.externalId,
    id: input.id,
    pageNumber: input.pageNumber,
    readingOrder: input.readingOrder,
    category: input.category,
    rawText: input.rawText,
    normalizedText: input.normalizedText,
    latex: input.latex,
    html: input.html,
    bbox: input.bbox,
    columnIndex: input.columnIndex,
    confidence: input.confidence,
    parentElementId: input.parentElementId,
    assetIds: input.assetIds ?? [],
    parserMetadata: input.parserMetadata,
  };
}

export function page(input: PageInput): LayoutPage {
  return {
    pageNumber: input.pageNumber,
    width: input.width ?? 1000,
    height: input.height ?? 1000,
    elements: input.elements.map(element),
  };
}

export function document(input: DocumentInput): LayoutDocument {
  return {
    schemaVersion: 'layout-v1',
    documentId: input.documentId,
    parseRunId: input.parseRunId ?? `${input.documentId}-parse-run`,
    parser: {
      name: 'DOCLING',
      version: '1.0.0',
      configurationHash: 'config-hash',
    },
    pages: input.pages.map(page),
    assets: input.assets ?? [],
    warnings: input.warnings ?? [],
  };
}

export function asset(input: VisualAsset): VisualAsset {
  return { ...input };
}
