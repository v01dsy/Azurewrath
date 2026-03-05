// app/news/create/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserSession } from '@/lib/userSession';
import { hasRole } from '@/lib/roles';

export default function CreateNewsPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [published, setPublished] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = getUserSession();
    if (!session) { router.push('/'); return; }
    fetch(`/api/user/role?userId=${session.robloxUserId}`)
      .then(r => r.json())
      .then(d => {
        if (!hasRole(d.role, 'mod')) router.push('/');
        else setAuthorized(true);
      });
  }, [router]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) { setError('Title and content are required.'); return; }
    setSubmitting(true);
    setError('');
    const res = await fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, excerpt: excerpt || null, published }),
    });
    if (res.ok) {
      const post = await res.json();
      router.push(`/news/${post.id}`);
    } else {
      const d = await res.json();
      setError(d.error || 'Failed to create post.');
      setSubmitting(false);
    }
  };

  if (!authorized) return null;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-8">
          New Post
        </h1>

        <div className="bg-slate-800/60 border border-purple-500/20 rounded-xl p-8 space-y-5">
          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-white outline-none focus:border-purple-500 transition"
              placeholder="Post title..."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Excerpt <span className="text-slate-600">(optional)</span></label>
            <input
              value={excerpt}
              onChange={e => setExcerpt(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-white outline-none focus:border-purple-500 transition"
              placeholder="Short summary shown on the news list..."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={12}
              className="w-full px-4 py-2.5 rounded-lg bg-slate-900 border border-white/10 text-white outline-none focus:border-purple-500 transition resize-y"
              placeholder="Write your post..."
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPublished(p => !p)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border transition ${
                published ? 'bg-green-600/30 border-green-500/40 text-green-300' : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              {published ? (
                <span className="flex items-center gap-1.5">
                  <img src="/Images/verify.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
                  Published
                </span>
              ) : 'Draft'}
            </button>
            <span className="text-slate-600 text-xs">{published ? 'Visible to everyone' : 'Only visible to you'}</span>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              {submitting ? 'Publishing...' : 'Publish Post'}
            </button>
            <button
              onClick={() => router.push('/news')}
              className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}