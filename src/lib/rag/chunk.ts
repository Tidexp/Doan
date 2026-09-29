const DEFAULT_MAX_CHARS = 3500;

export type TextChunk = {
  content: string;
  heading?: string;
  chunkIndex: number;
  tokenCount: number;
};

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function isHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,6}\s+\S/.test(trimmed)) return true;
  if (/^(chapter|chương|section|mục|điều)\s+\d+/i.test(trimmed)) return true;
  if (trimmed.length <= 80 && /^[A-Z0-9][A-Z0-9\s\-/:]{8,}$/.test(trimmed)) {
    return true;
  }
  return false;
}

function splitOversized(text: string, maxChars: number) {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = "";
  for (const para of paragraphs) {
    if ((current + "\n\n" + para).trim().length > maxChars && current) {
      parts.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.flatMap((part) => {
    if (part.length <= maxChars) return [part];
    const hard: string[] = [];
    for (let i = 0; i < part.length; i += maxChars) {
      hard.push(part.slice(i, i + maxChars));
    }
    return hard;
  });
}

export function chunkByHeading(text: string): TextChunk[] {
  const maxChars = Number(process.env.CHUNK_MAX_CHARS ?? DEFAULT_MAX_CHARS);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: { heading?: string; body: string[] }[] = [
    { heading: undefined, body: [] },
  ];

  for (const line of lines) {
    if (isHeading(line) && sections[sections.length - 1].body.join("\n").trim()) {
      sections.push({
        heading: line.replace(/^#{1,6}\s+/, "").trim(),
        body: [],
      });
    } else if (isHeading(line) && !sections[sections.length - 1].body.length) {
      sections[sections.length - 1].heading = line
        .replace(/^#{1,6}\s+/, "")
        .trim();
    } else {
      sections[sections.length - 1].body.push(line);
    }
  }

  const raw = sections
    .map((section) => ({
      heading: section.heading,
      content: section.body.join("\n").trim(),
    }))
    .filter((s) => s.content.length > 40);

  const expanded = raw.flatMap((section) =>
    splitOversized(section.content, maxChars).map((content) => ({
      heading: section.heading,
      content,
    })),
  );

  return expanded.map((item, chunkIndex) => ({
    content: item.heading
      ? `${item.heading}\n\n${item.content}`
      : item.content,
    heading: item.heading,
    chunkIndex,
    tokenCount: estimateTokens(item.content),
  }));
}
