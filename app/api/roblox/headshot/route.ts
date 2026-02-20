// app/api/roblox/headshot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const size = searchParams.get('size') || '150x150';

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=${size}&format=Png`;
    const response = await axios.get(url);
    const data = response.data;

    if (data && data.data && data.data.length > 0 && data.data[0].imageUrl) {
      return NextResponse.json({ imageUrl: data.data[0].imageUrl });
    }

    return NextResponse.json({ error: 'No image found' }, { status: 404 });
  } catch (error) {
    console.error('Failed to fetch headshot:', error);
    return NextResponse.json({ error: 'Failed to fetch headshot' }, { status: 500 });
  }
}