export function MetaRow({ parts }: { parts: string[] }) {
  if (parts.length === 0) return null;
  return (
    <div className='mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500'>
      {parts.map((p, i) => (
        <span key={i} className='after:ml-2 after:text-gray-300 after:content-["·"] last:after:content-[""]'>
          {p}
        </span>
      ))}
    </div>
  );
}
