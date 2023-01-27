const STATUS_CONTEXT = "qvet/qa";

import { Octokit } from "octokit";
import { OwnerRepo, Status } from "src/octokitHelpers";

export async function getCommitStatus(
  octokit: Octokit,
  ownerRepo: OwnerRepo,
  sha: string
): Promise<Status | null> {
  const branch = await octokit.rest.repos.listCommitStatusesForRef({
    ...ownerRepo,
    ref: sha,
  });
  for (const status of branch.data) {
    if (status.context === STATUS_CONTEXT) {
      return status;
    }
  }
  return null;
}

export type WriteableState = "success" | "failure" | "pending";

function stateDescriptionStem(state: WriteableState): string {
  switch (state) {
    case "success":
      return "Approved";
    case "failure":
      return "Rejected";
    case "pending":
      return "Cleared";
  }
}

export async function setCommitStatus(
  octokit: Octokit,
  ownerRepo: OwnerRepo,
  sha: string,
  login: string,
  state: WriteableState
): Promise<Status> {
  const { data } = await octokit.rest.repos.createCommitStatus({
    ...ownerRepo,
    sha,
    context: STATUS_CONTEXT,
    state,
    target_url: "http://localhost:39105/",
    description: `${stateDescriptionStem(state)} by ${login}`,
  });
  return data;
}
