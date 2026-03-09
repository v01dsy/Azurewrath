import { Metadata } from 'next';
import prisma from '@/lib/prisma';

export async function generateMetadata({ params }: { params: Promise<{ userid: string }> }): Promise<Metadata> {
  const { userid } = await params;
  try {
    const user = await prisma.user.findUnique({
      where: { robloxUserId: BigInt(userid) },
      select: { username: true, displayName: true },
    });
    const name = user?.displayName || user?.username || 'Player';
    return {
      title: `${name} | History`,
      description: `View ${name}'s full Roblox limited inventory history and RAP changes on Azurewrath.`,
    };
  } catch {
    return {
      title: 'History',
      description: 'View Roblox limited inventory history on Azurewrath.',
    };
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}