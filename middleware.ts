import { next } from "@vercel/functions";

export const config = { matcher: "/:path*" };

export default function middleware(request: Request) {
  if (process.env.VERCEL_ENV !== "production") return next();

  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return new Response("Service unavailable", { status: 503 });

  const authorization = request.headers.get("authorization") || "";
  try {
    const credentials = atob(authorization.replace(/^Basic\s+/i, ""));
    const separator = credentials.indexOf(":");
    if (separator > 0 && credentials.slice(0, separator) === user && credentials.slice(separator + 1) === password) return next();
  } catch {}

  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="HANTEI", charset="UTF-8"',
      "Cache-Control": "no-store"
    }
  });
}
