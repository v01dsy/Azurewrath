'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getUserSession } from '@/lib/userSession';
import { hasRole } from '@/lib/roles';

interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  createdAt: string;
  author: { username: string; avatarUrl: string | null };
}

export default function NewsPostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('user');

  useEffect(() => {
    const session = getUserSession();
    if (session) {
      fetch(`/api/user/role?userId=${session.robloxUserId}`)
        .then(r => r.json())
        .then(d => setUserRole(d.role ?? 'user'))
        .catch(() => {});
    }

    fetch(`/api/news/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setPost(data))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Delete this post?')) return;
    await fetch(`/api/news/${id}`, { method: 'DELETE' });
    router.push('/news');
  };

  if (loading) return <div className="text-slate-400 text-center py-20">Loading...</div>;
  if (!post) return <div className="text-slate-400 text-center py-20">Post not found.</div>;

  return (
    <div className="min-h-screen w-full text-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/news" className="text-slate-400 hover:text-white text-sm transition">
            ← Back to News
          </Link>
          {hasRole(userRole, 'moderator') && (
            <button
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded-lg border border-red-500/20 hover:border-red-500/40 transition"
            >
              Delete Post
            </button>
          )}
        </div>

        <div className="bg-slate-800/60 border border-purple-500/20 rounded-xl p-8">
          <h1 className="text-3xl font-bold text-white mb-3">{post.title}</h1>
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-8 pb-6 border-b border-white/10">
            {post.author.avatarUrl && (
              <img src={post.author.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
            )}
            <span>{post.author.username}</span>
            <span>·</span>
            <span>{new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
          <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">{post.content}</div>
        </div>
      </div>
    </div>
  );
}