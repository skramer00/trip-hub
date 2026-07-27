import { NextResponse } from 'next/server';
import { loadState, saveState } from '@/lib/db';
import { initialState } from '@/data/initial';

export async function GET() {
  const stored = await loadState();
  const state = stored
    ? {
        ...initialState,
        ...stored,
        places: stored.places?.length ? stored.places : initialState.places,
      }
    : initialState;

  return NextResponse.json({
    state,
    cloud: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
    ),
  });
}

export async function PUT(req: Request) {
  const state = await req.json();
  const saved = await saveState(state);
  return NextResponse.json({ ok: true, cloud: saved });
}
