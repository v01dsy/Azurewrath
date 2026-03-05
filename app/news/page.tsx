// app/news/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { hasRole, canDeletePost } from '@/lib/roles';

interface Post {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  createdAt: string;
  authorId: string;
  author: { username: string; avatarUrl: string | null; role: string };
}

export default function NewsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('user');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const session = getUserSession();
    if (session) {
      setCurrentUserId(session.robloxUserId);
      fetch(`/api/user/role?userId=${session.robloxUserId}`)
        .then(r => r.json())
        .then(d => setUserRole(d.role ?? 'user'))
        .catch(() => {});
    }

    fetch('/api/news')
      .then(r => r.json())
      .then(async (data: Post[]) => {
        setPosts(data);

        // Fetch which posts the user has already read
        if (session) {
          const res = await fetch(`/api/news/read-status?userId=${session.robloxUserId}`);
          if (res.ok) {
            const { readPostIds } = await res.json();
            setReadIds(new Set(readPostIds));
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this post?')) return;
    await fetch(`/api/news/${id}`, { method: 'DELETE' });
    setPosts(p => p.filter(post => post.id !== id));
  };

  const unreadCount = posts.filter(p => !readIds.has(p.id)).length;

  return (
    <div className="min-h-screen w-full text-white p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              News
            </h1>
            {currentUserId && unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {userRole === 'owner' && (
              <Link
                href="/news/trash"
                className="px-3 py-2 bg-slate-800 border border-red-500/20 hover:border-red-500/40 rounded-lg text-sm text-red-400 hover:text-red-300 transition"
                title="View deleted posts"
              >
                🗑️ Trash
              </Link>
            )}
            {hasRole(userRole, 'moderator') && (
              <Link
                href="/news/create"
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-sm font-semibold hover:opacity-90 transition"
              >
                + New Post
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-slate-400 text-center py-20">Loading...</div>
        ) : posts.length === 0 ? (
          <div className="text-slate-400 text-center py-20">No news posts yet.</div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => {
              const isUnread = currentUserId && !readIds.has(post.id);
              return (
                <div
                  key={post.id}
                  className={`rounded-xl p-6 transition border ${
                    isUnread
                      ? 'bg-blue-950/30 border-blue-500/40 hover:border-blue-400/60'
                      : 'bg-slate-800/60 border-purple-500/20 hover:border-purple-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isUnread && (
                          <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400" title="Unread" />
                        )}
                        <Link href={`/news/${post.id}`}>
                          <h2 className={`text-xl font-bold transition truncate ${
                            isUnread ? 'text-white hover:text-blue-300' : 'text-white hover:text-purple-300'
                          }`}>
                            {post.title}
                          </h2>
                        </Link>
                        {isUnread && (
                          <span className="flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            NEW
                          </span>
                        )}
                      </div>
                      {post.excerpt && (
                        <p className="text-slate-400 text-sm line-clamp-2 mb-3">{post.excerpt}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {post.author.avatarUrl && (
                          <img src={post.author.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                        )}
                        <span>{post.author.username}</span>
                        <span>·</span>
                        <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {canDeletePost(userRole, post.author.role, currentUserId, post.authorId) && (
                      <button
                        onClick={() => handleDelete(post.id)}
                        className="text-red-400 hover:text-red-300 text-xs px-3 py-1 rounded-lg border border-red-500/20 hover:border-red-500/40 transition flex-shrink-0"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}