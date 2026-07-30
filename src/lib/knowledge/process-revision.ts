export type KnowledgeContentUnit = {
  position: number;
  heading: string | null;
  content: string;
  embedding: number[];
};

export type CompletedKnowledgeRevision = {
  id: string;
  contentUnits: KnowledgeContentUnit[];
};

export type KnowledgeRevision = {
  id: string;
  title: string;
  body: string;
};

export type EmbeddingProvider = {
  embed(texts: string[]): Promise<number[][]>;
};

export type KnowledgeRevisionRepository = {
  advanceStage?(
    revisionId: string,
    stage: KnowledgeRevisionProcessingStage,
  ): Promise<void>;
  complete(revision: CompletedKnowledgeRevision): Promise<void>;
  fail(revisionId: string, reason: string): Promise<void>;
};

export type KnowledgeRevisionProcessingStage =
  | "fetching"
  | "extracting"
  | "forming_content_units"
  | "vectorizing";

export type KnowledgeProcessingDependencies = {
  embeddingProvider: EmbeddingProvider;
  revisionRepository: KnowledgeRevisionRepository;
};

export type KnowledgeProcessingResult =
  | { status: "available" }
  | { status: "failed"; reason: string };

type PreparedContentUnit = Omit<KnowledgeContentUnit, "embedding">;

const MAXIMUM_BODY_CHARACTERS = 50_000;
const MAXIMUM_CONTENT_UNIT_CHARACTERS = 1_200;
const MAXIMUM_HEADING_CHARACTERS = 200;

export async function processKnowledgeRevision(
  revision: KnowledgeRevision,
  dependencies: KnowledgeProcessingDependencies,
): Promise<KnowledgeProcessingResult> {
  const body = revision.body.trim();
  const bodyCharacterCount = Array.from(body).length;

  if (bodyCharacterCount === 0) {
    const reason = "正文内容不能为空，请补充后重试。";
    return failRevision(revision.id, reason, dependencies.revisionRepository);
  }

  if (bodyCharacterCount > MAXIMUM_BODY_CHARACTERS) {
    const reason = `正文内容过长，请缩减到 ${MAXIMUM_BODY_CHARACTERS} 个字符以内后重试。`;
    return failRevision(revision.id, reason, dependencies.revisionRepository);
  }

  const preparedUnits = formContentUnits(revision.title, body);

  try {
    await dependencies.revisionRepository.advanceStage?.(
      revision.id,
      "vectorizing",
    );
  } catch {
    const reason = "知识处理暂时无法完成，请稍后重试。";
    return failRevision(revision.id, reason, dependencies.revisionRepository);
  }

  let embeddings: number[][];

  try {
    embeddings = await dependencies.embeddingProvider.embed(
      preparedUnits.map(({ content }) => content),
    );
  } catch {
    const reason = "向量服务暂时不可用，请稍后重试。";
    return failRevision(revision.id, reason, dependencies.revisionRepository);
  }

  const contentUnits = preparedUnits.map((unit, index) => ({
    ...unit,
    embedding: embeddings[index] ?? [],
  }));

  try {
    await dependencies.revisionRepository.complete({
      id: revision.id,
      contentUnits,
    });
  } catch {
    const reason = "知识处理暂时无法完成，请稍后重试。";
    return failRevision(revision.id, reason, dependencies.revisionRepository);
  }

  return { status: "available" };
}

function formContentUnits(title: string, body: string): PreparedContentUnit[] {
  const units: PreparedContentUnit[] = [];

  for (const { heading, paragraph } of identifyParagraphs(body)) {
    const context = [title.trim(), heading].filter(Boolean).join("\n\n");
    const availableCharacters = Math.max(
      200,
      MAXIMUM_CONTENT_UNIT_CHARACTERS - Array.from(context).length - 2,
    );

    for (const segment of splitAtSentenceBoundaries(
      paragraph,
      availableCharacters,
    )) {
      units.push({
        position: units.length,
        heading,
        content: [context, segment].filter(Boolean).join("\n\n"),
      });
    }
  }

  if (units.length === 0) {
    units.push({
      position: 0,
      heading: null,
      content: [title.trim(), body].filter(Boolean).join("\n\n"),
    });
  }

  return units;
}

function identifyParagraphs(body: string) {
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const paragraphs: Array<{ heading: string | null; paragraph: string }> = [];
  let heading: string | null = null;
  let paragraphLines: string[] = [];
  let atBoundary = true;
  let awaitingHeadingContent = false;

  function flushParagraph() {
    const paragraph = paragraphLines.join("\n").trim();
    paragraphLines = [];

    if ((paragraph.match(/[\p{L}\p{N}]/gu) ?? []).length > 0) {
      paragraphs.push({ heading, paragraph });
    }
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      atBoundary = !awaitingHeadingContent;
      return;
    }

    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/);
    const headingText = markdownHeading?.[1]?.trim() ?? line;
    const isHeading =
      Array.from(headingText).length <= MAXIMUM_HEADING_CHARACTERS &&
      (Boolean(markdownHeading) ||
        (!awaitingHeadingContent &&
          atBoundary &&
          looksLikePlainHeading(line) &&
          hasFollowingContent(lines, index + 1)));

    if (isHeading) {
      flushParagraph();
      heading = headingText;
      awaitingHeadingContent = true;
      atBoundary = false;
      return;
    }

    paragraphLines.push(line);
    awaitingHeadingContent = false;
    atBoundary = false;
  });

  flushParagraph();
  return paragraphs;
}

function looksLikePlainHeading(line: string) {
  const characterCount = Array.from(line).length;
  const meaningfulCharacters = (line.match(/[\p{L}\p{N}]/gu) ?? []).length;

  return (
    characterCount <= 40 &&
    meaningfulCharacters >= 2 &&
    !/[。！？!?；;，,:：,.]$/u.test(line)
  );
}

function hasFollowingContent(lines: string[], startIndex: number) {
  return lines.slice(startIndex).some((line) => line.trim().length > 0);
}

function splitAtSentenceBoundaries(text: string, maximumCharacters: number) {
  const sentences = text.match(/[^。！？!?；;]+[。！？!?；;]?/gu) ?? [text];
  const segments: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    for (const piece of sliceByCharacters(sentence, maximumCharacters)) {
      if (
        current &&
        Array.from(current).length + Array.from(piece).length >
          maximumCharacters
      ) {
        segments.push(current);
        current = "";
      }

      current += piece;
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments;
}

function sliceByCharacters(text: string, maximumCharacters: number) {
  const characters = Array.from(text);
  const slices: string[] = [];

  for (let index = 0; index < characters.length; index += maximumCharacters) {
    slices.push(characters.slice(index, index + maximumCharacters).join(""));
  }

  return slices;
}

async function failRevision(
  revisionId: string,
  reason: string,
  repository: KnowledgeRevisionRepository,
): Promise<KnowledgeProcessingResult> {
  await repository.fail(revisionId, reason);
  return { status: "failed", reason };
}
