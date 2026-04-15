export type IngestionRunAssessmentOutcome =
	| "included"
	| "excluded_failed"
	| "excluded_incomplete"
	| "excluded_empty";

export type IngestionRunAssessment = {
	included: boolean;
	outcome: IngestionRunAssessmentOutcome;
	completenessRatio: number | null;
	reason: string;
};

export const MINIMUM_INGESTION_COMPLETENESS_RATIO = 0.6;

export function assessIngestionRun(input: {
	status: "queued" | "running" | "succeeded" | "failed";
	discoveredCount: number;
	normalizedCount: number;
	errorMessage?: string | null;
}): IngestionRunAssessment {
	if (input.status !== "succeeded") {
		return {
			included: false,
			outcome: "excluded_failed",
			completenessRatio: null,
			reason: input.errorMessage?.trim() || `Run ended with status ${input.status}.`,
		};
	}

	if (input.discoveredCount <= 0) {
		return {
			included: false,
			outcome: "excluded_empty",
			completenessRatio: null,
			reason: "Run succeeded but produced zero discovered candidates.",
		};
	}

	const completenessRatio = input.normalizedCount / input.discoveredCount;
	if (completenessRatio < MINIMUM_INGESTION_COMPLETENESS_RATIO) {
		return {
			included: false,
			outcome: "excluded_incomplete",
			completenessRatio,
			reason: `Run normalized ${(completenessRatio * 100).toFixed(0)}% of discovered candidates (${input.normalizedCount}/${input.discoveredCount}).`,
		};
	}

	return {
		included: true,
		outcome: "included",
		completenessRatio,
		reason: `Run normalized ${(completenessRatio * 100).toFixed(0)}% of discovered candidates.`,
	};
}

export function formatIngestionAssessmentLabel(
	outcome: IngestionRunAssessmentOutcome
): string {
	switch (outcome) {
		case "included":
			return "Included";
		case "excluded_failed":
			return "Failed";
		case "excluded_incomplete":
			return "Incomplete";
		case "excluded_empty":
			return "Empty";
	}
}
