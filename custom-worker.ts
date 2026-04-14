import handler from "./.open-next/worker.js";

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.hostname === "www.grant-aggregator.matteo-tanzi.dev") {
      url.hostname = "grant-aggregator.matteo-tanzi.dev";
      return Response.redirect(url.toString(), 308);
    }

    return handler.fetch(request, env, ctx);
  },

  async queue(
    batch: MessageBatch<unknown>,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
    for (const message of batch.messages) {
      console.log(
        `Processing message ${message.id}:`,
        JSON.stringify(message.body)
      );
      message.ack();
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ) {
    switch (controller.cron) {
      case "0 * * * *":
        console.log(
          `Hourly job triggered at ${new Date(controller.scheduledTime).toISOString()}`
        );
        break;
      default:
        console.log(`Unrecognized cron pattern: ${controller.cron}`);
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;
