import ReactMarkdown from 'react-markdown';

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
};

export function Markdown({ children }: { children: string }) {
  return <ReactMarkdown components={COMPONENTS}>{children}</ReactMarkdown>;
}
