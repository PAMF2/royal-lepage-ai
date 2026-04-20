import { progress } from "@/lib/progress";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let lastLog = 0;
      while (progress.running || lastLog < progress.log.length) {
        send({
          total: progress.total,
          done: progress.done,
          errors: progress.errors,
          running: progress.running,
          newLogs: progress.log.slice(lastLog),
        });
        lastLog = progress.log.length;
        if (!progress.running) break;
        await new Promise((r) => setTimeout(r, 800));
      }

      // Final update
      send({
        total: progress.total,
        done: progress.done,
        errors: progress.errors,
        running: false,
        newLogs: progress.log.slice(lastLog),
        finished: true,
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
