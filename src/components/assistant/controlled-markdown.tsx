import Markdown from "react-markdown";

const allowedElements = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "br",
];

export function ControlledMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      allowedElements={allowedElements}
      components={{
        h1: ({ children: heading }) => (
          <h3 className="mt-4 text-base font-semibold first:mt-0">{heading}</h3>
        ),
        h2: ({ children: heading }) => (
          <h3 className="mt-4 text-base font-semibold first:mt-0">{heading}</h3>
        ),
        h3: ({ children: heading }) => (
          <h3 className="mt-4 text-sm font-semibold first:mt-0">{heading}</h3>
        ),
        p: ({ children: paragraph }) => (
          <p className="mt-2 text-sm leading-6 first:mt-0">{paragraph}</p>
        ),
        strong: ({ children: content }) => (
          <strong className="font-semibold">{content}</strong>
        ),
        em: ({ children: content }) => <em>{content}</em>,
        ul: ({ children: items }) => (
          <ul className="mt-2 list-disc space-y-1 pl-5">{items}</ul>
        ),
        ol: ({ children: items }) => (
          <ol className="mt-2 list-decimal space-y-1 pl-5">{items}</ol>
        ),
        li: ({ children: item }) => <li className="text-sm leading-6">{item}</li>,
        blockquote: ({ children: quote }) => (
          <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink-600">
            {quote}
          </blockquote>
        ),
        code: ({ children: code }) => (
          <code className="mono rounded bg-paper px-1 py-0.5 text-[0.9em]">
            {code}
          </code>
        ),
        pre: ({ children: code }) => (
          <pre className="mono mt-2 overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs leading-5">
            {code}
          </pre>
        ),
      }}
      skipHtml
    >
      {children}
    </Markdown>
  );
}
