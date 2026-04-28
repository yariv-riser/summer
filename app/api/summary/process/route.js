import { verifySignatureAppRouter } from '@upstash/qstash/nextjs';
import { runPipeline } from '@/lib/pipeline';

async function handler(req) {
  const { userId, userEmail, from, to } = await req.json();
  await runPipeline({ userId, userEmail, from, to });
  return Response.json({ status: 'done' });
}

let verified;
export async function POST(req) {
  if (!verified) verified = verifySignatureAppRouter(handler);
  return verified(req);
}

export const maxDuration = 60;
