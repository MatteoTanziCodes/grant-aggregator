import handler from "./.open-next/worker.js";

const MONTHLY_DIGEST_CRON = "0 13 1 * *";
const MONTHLY_DIGEST_PATH = "/api/internal/monthly-digest/run";

async function sendOpsAlert(
	env: CloudflareEnv,
	subject: string,
	details: string
): Promise<void> {
	const resendApiKey = (env as Record<string, string | undefined>).RESEND_API_KEY;
	if (!resendApiKey) {
		console.error("RESEND_API_KEY is not configured. Cannot send ops alert.");
		return;
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${resendApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: "Grant Aggregator <ops@matteo-tanzi.dev>",
			to: ["matteo.beatstanzi@gmail.com"],
			subject,
			text: details,
			html: `<pre>${details}</pre>`,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		console.error("Failed to send ops alert via Resend.", {
			status: response.status,
			body,
		});
	}
}

async function dispatchMonthlyDigest(
	env: CloudflareEnv,
	ctx: ExecutionContext,
	controller: ScheduledController
) {
	const monthlyJobSecret = env.MONTHLY_JOB_SECRET;
	if (!monthlyJobSecret) {
		throw new Error("MONTHLY_JOB_SECRET is not configured — monthly digest will not run");
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
		ctx.waitUntil(
			sendOpsAlert(
				env,
				"[Grant Aggregator] Monthly digest HTTP error",
				`Monthly digest returned HTTP ${response.status}:\n\n${payloadText}`,
			)
		);
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
		const batchStatus = (parsed as Record<string, unknown>).batchStatus as string;
		console.warn("Scheduled monthly digest completed with issues.", parsed);
		ctx.waitUntil(
			sendOpsAlert(
				env,
				`[Grant Aggregator] Monthly digest ${batchStatus}`,
				`Monthly digest completed with status '${batchStatus}':\n\n${JSON.stringify(parsed, null, 2)}`,
			)
		);
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
