import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/** Refreshes the Supabase session cookie and keeps signed-out users on /login. */
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  const isApp = path === "/" || path.startsWith("/inbox") || path.startsWith("/connections");
  if (!data.user && isApp) return NextResponse.redirect(new URL("/login", req.url));
  if (data.user && path === "/login") return NextResponse.redirect(new URL("/inbox", req.url));
  return res;
}

export const config = {
  // Webhooks are public (signature-checked) and must not be redirected.
  matcher: ["/((?!_next/|favicon.ico|api/webhooks/).*)"],
};
