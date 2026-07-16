import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function proxy(req: NextRequest, path: string[]) {
  const target = `${BACKEND}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");

  const init: RequestInit = {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
  };

  const res = await fetch(target, init);
  return new NextResponse(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  return proxy(req, ctx.params.path);
}

export async function POST(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  return proxy(req, ctx.params.path);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  return proxy(req, ctx.params.path);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  return proxy(req, ctx.params.path);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: { path: string[] } }
) {
  return proxy(req, ctx.params.path);
}
