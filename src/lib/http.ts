import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "./supabase";

/** Wraps a route handler: HttpError → its status, anything else → 500 with a safe message. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      const message = e instanceof Error ? e.message : "Something went wrong.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
