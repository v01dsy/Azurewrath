'use client';

import { useState } from 'react';

export default function DescriptionButton({ description, name }: { description: string; name: string }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <p className="text-[#888] text-sm truncate">{description}</p>
      {description.length > 40 && (
        <button onClick={() => setShow(true)} className="text-purple-400 hover:text-purple-300 text-xs mt-1 transition">
          View more
        </button>
      )}
      {show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShow(false)}>
          <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-white text-xl font-semibold">About {name}</h3>
              <button onClick={() => setShow(false)} className="text-[#aaa] hover:text-white transition text-2xl leading-none">×</button>
            </div>
            <p className="text-[#ccc] whitespace-pre-wrap">{description}</p>
          </div>
        </div>
      )}
    </>
  );
}