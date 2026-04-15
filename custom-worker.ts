import handler from "./.open-next/worker.js";

const MONTHLY_DIGEST_CRON = "0 13 1 * *";
const MONTHLY_DIGEST_PATH = "/api/internal/monthly-digest/run";

async function dispatchMonthlyDigest(
	env: CloudflareEnv,
	ctx: ExecutionContext,
	controller: ScheduledController
) {
	const monthlyJobSecret = env.MONTHLY_JOB_SECRET;
	if (!monthlyJobSecret) {
		console.error("MONTHLY_JOB_SECRET is not configured. Skipping scheduled monthly digest.");
		return;
	}

	const baseUrl =
		env.EMAIL_VERIFICATION_BASE_URL ??
		"https://grant-aggregator.matteo-tanzi.dev";
	const request = new Request(new URL(MONTHLY_DIGEST_PATH, baseUrl), {
		method: "POST",
		headers: {
			"x-monthly-job-secret": monthlyJobSecret,
			"x-scheduled-cron": controller.cron,
		},
	});
	const response = await handler.fetch(request, env, ctx);
	const payloadText = await response.text();

	if (!response.ok) {
		console.error("Scheduled monthly digest failed.", {
			status: response.status,
			body: payloadText,
		});
		return;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(payloadText);
	} catch {
		parsed = payloadText;
	}

	if (
		parsed &&
		typeof parsed === "object" &&
		"batchStatus" in parsed &&
		(parsed.batchStatus === "completed_with_failures" ||
			parsed.batchStatus === "failed")
	) {
		console.warn("Scheduled monthly digest completed with issues.", parsed);
		return;
	}

	console.log("Scheduled monthly digest completed.", parsed);
}

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
      case MONTHLY_DIGEST_CRON:
        ctx.waitUntil(dispatchMonthlyDigest(env, ctx, controller));
        break;
      default:
        console.log(`Unrecognized cron pattern: ${controller.cron}`);
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;
