import { runCleanup } from "@/lib/cleanup";
import { isCronAuthorized } from "@/lib/cron-auth";

// Called daily by Vercel Cron (vercel.json) with Authorization: Bearer CRON_SECRET
export async function GET(request: Request) {
  if (
    !isCronAuthorized(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runCleanup(new Date());
  console.log("cleanup", JSON.stringify(result));
  return Response.json(result);
}
