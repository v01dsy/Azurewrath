import { PrismaClient } from '@prisma/client';
import Image from 'next/image';
import { fetchRobloxUserInfo, fetchRobloxHeadshotUrl } from '@/lib/robloxApi';

const prisma = new PrismaClient();

export default async function PlayerPage({ params }: { params: Promise<{ userid: string }> }) {
  // Await params first
  const { userid } = await params;
  
  let user = null;
  if (userid) {
    user = await prisma.user.findUnique({ where: { robloxUserId: userid } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { id: userid } });
    }
  }

  // If user not found, create profile from Roblox info
  if (!user && userid) {
    try {
      const robloxInfo = await fetchRobloxUserInfo(userid);
      const avatarUrl = await fetchRobloxHeadshotUrl(robloxInfo.id.toString());
      
      user = await prisma.user.create({
        data: {
          robloxUserId: robloxInfo.id.toString(),
          username: robloxInfo.name,
          displayName: robloxInfo.displayName,
          avatarUrl: avatarUrl || '',
          description: robloxInfo.description,
        },
      });
    } catch (e) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
          <div className="text-white text-2xl">User not found and could not be created.</div>
        </div>
      );
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-2xl">User not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl border border-purple-500/20 p-8 w-full max-w-md shadow-lg flex flex-col items-center">
        {user.avatarUrl && (
          <Image src={user.avatarUrl} alt={user.username} width={150} height={150} className="rounded-full mb-4" />
        )}
        <h1 className="text-3xl font-bold text-white mb-2">{user.displayName || user.username}</h1>
        <p className="text-purple-300 mb-2">@{user.username}</p>
        {user.description && <p className="text-slate-300 mb-4">{user.description}</p>}
        <div className="text-slate-400 text-sm">Roblox User ID: {user.robloxUserId}</div>
      </div>
    </div>
  );
}