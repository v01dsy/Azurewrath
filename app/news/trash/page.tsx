// app/news/trash/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';

interface TrashedPost {
  id: number;
  title: string;
  excerpt: string | null;
  createdAt: string;
  deletedAt: string;
  deletedReason: string | null;
  deletedByUsername: string | null;
  author: { username: string; avatarUrl: string | null; role: string };
}

export default function NewsTrashPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<TrashedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = getUserSession();
    if (!session) { router.push('/'); return; }
    fetch(`/api/user/role?userId=${session.robloxUserId}`)
      .then(r => r.json())
      .then(d => {
        if (d.role !== 'owner') { router.push('/news'); return; }
        setAuthorized(true);
        return fetch('/api/news/trash');
      })
      .then(r => r?.json())
      .then(data => { if (data) setPosts(data); })
      .finally(() => setLoading(false));
  }, [router]);

  const handleRestore = async (id: number) => {
    if (!confirm('Restore this post? It will become visible again.')) return;
    setRestoring(id);
    const res = await fetch('/api/news/trash', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setPosts(p => p.filter(post => post.id !== id));
    setRestoring(null);
  };

  if (!authorized) return null;

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a]/60 text-white -mt-20 pt-28 px-4 pb-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/news" className="text-slate-500 hover:text-slate-300 text-sm transition">
              ← Back to News
            </Link>
            <h1 className="text-3xl font-bold mt-2 bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
              🗑️ Deleted Posts
            </h1>
            <p className="text-slate-500 text-sm mt-1">Posts are never permanently lost. Only you can see and restore these.</p>
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-20">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">✨</div>
            <p className="text-slate-400">No deleted posts — trash is empty.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <div key={post.id} className="bg-slate-800/60 border border-red-500/20 rounded-xl p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-bold text-white/70 mb-1 truncate">{post.title}</h2>
                    {post.excerpt && <p className="text-slate-500 text-sm line-clamp-2 mb-3">{post.excerpt}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {post.author.avatarUrl && <img src={post.author.avatarUrl} alt="" className="w-4 h-4 rounded-full" />}
                      <span>by <span className="text-slate-400">{post.author.username}</span></span>
                      <span>·</span>
                      <span>posted {new Date(post.createdAt).toLocaleDateString()}</span>
                      <span>·</span>
                      <span className="text-red-400">
                        deleted {new Date(post.deletedAt).toLocaleDateString()}
                        {post.deletedByUsername && ` by ${post.deletedByUsername}`}
                      </span>
                      {post.deletedReason && (
                        <>
                          <span>·</span>
                          <span className="text-orange-400/80 italic">"{post.deletedReason}"</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(post.id)}
                    disabled={restoring === post.id}
                    className="text-green-400 hover:text-green-300 text-xs px-3 py-1.5 rounded-lg border border-green-500/20 hover:border-green-500/40 transition flex-shrink-0 disabled:opacity-50"
                  >
                    {restoring === post.id ? 'Restoring...' : '↩ Restore'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}