import { Client } from '@upstash/qstash';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

const qstash = new Client({ token: process.env.QSTASH_TOKEN });

export async function POST(req) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { from, to } = await req.json();
  if (!from || !to) {
    return Response.json({ error: 'missing from/to' }, { status: 400 });
  }

  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/summary/process`,
    body: { userId: session.user.id, userEmail: session.user.email, from, to },
    retries: 2,
  });

  return Response.json({ status: 'queued' });
}
