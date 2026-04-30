import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: ({ children }) => <h3 className='mt-4 mb-2 text-base font-semibold'>{children}</h3>,
  h2: ({ children }) => <h3 className='mt-4 mb-2 text-base font-semibold'>{children}</h3>,
  h3: ({ children }) => <h3 className='mt-4 mb-2 text-base font-semibold'>{children}</h3>,
  p: ({ children }) => <p className='my-2 leading-relaxed'>{children}</p>,
  ul: ({ children }) => <ul className='my-2 ml-5 list-disc space-y-1'>{children}</ul>,
  ol: ({ children }) => <ol className='my-2 ml-5 list-decimal space-y-1'>{children}</ol>,
  li: ({ children }) => <li className='leading-relaxed'>{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target='_blank'
      rel='noreferrer'
      className='text-sky-700 underline underline-offset-2 hover:text-sky-800'
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className='rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800'>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className='my-2 overflow-x-auto rounded-md border bg-gray-50 p-3 text-xs text-gray-800'>{children}</pre>
  ),
  strong: ({ children }) => <strong className='font-semibold'>{children}</strong>,
  table: ({ children }) => (
    <div className='my-3 overflow-x-auto'>
      <table className='w-full border-collapse text-sm'>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className='bg-gray-50'>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className='border-b border-gray-200 last:border-b-0'>{children}</tr>,
  th: ({ children }) => (
    <th className='border-b border-gray-300 px-3 py-2 text-left font-semibold text-gray-700'>{children}</th>
  ),
  td: ({ children }) => <td className='px-3 py-2 align-top text-gray-800'>{children}</td>,
};

const PLUGINS = [remarkGfm];

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown components={COMPONENTS} remarkPlugins={PLUGINS}>
      {children}
    </ReactMarkdown>
  );
}
