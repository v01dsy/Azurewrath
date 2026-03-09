import { Metadata } from "next";
import prisma from "@/lib/prisma";

export async function generateMetadata({ params }: { params: Promise<{ uaid: string }> }): Promise<Metadata> {
  const { uaid } = await params;
  try {
    const uaidBigInt = BigInt(uaid); // this can throw if uaid is invalid
    const item = await prisma.inventoryItem.findFirst({
      where: { userAssetId: uaidBigInt },
      orderBy: { scannedAt: 'desc' },
      include: { item: { select: { name: true } } },
    });
    const itemName = item?.item?.name ?? 'Unknown Item';
    return {
      title: `${itemName} | UAID ${uaid}`,
      description: `View ownership history and details for ${itemName} UAID ${uaid} on Azurewrath.`,
    };
  } catch {
    return {
      title: `UAID ${uaid}`,
      description: `View ownership history for UAID ${uaid} on Azurewrath.`,
    };
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}