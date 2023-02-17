import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Octokit } from "octokit";
import CommitTable from "src/components/CommitTable";
import LoginStatus from "src/components/LoginStatus";
import LoginButton from "src/components/LoginButton";
import VersionUpdate from "src/components/VersionUpdate";
import useOctokit from "src/hooks/useOctokit";
import useLogin from "src/hooks/useLogin";
import useAccessToken from "src/hooks/useAccessToken";
import Stack from "@mui/material/Stack";
import {
  OwnerRepo,
  OwnerRepoContext,
  CommitComparison,
} from "src/octokitHelpers";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";

export function Home() {
  // Backcompat - remove existing token storage in browser
  localStorage.removeItem("access_token");
  const accessToken = useAccessToken();
  const loggedIn = !(accessToken.isLoading || accessToken.isError);
  return (
    <Box style={{ width: "100%", padding: "8px" }}>
      <Stack spacing={2} alignItems="center">
        <VersionUpdate />
        <Typography variant="h2">qvet</Typography>
        {loggedIn ? (
          <Overview />
        ) : (
          <Box>
            <LoginButton loggedIn={loggedIn} />
          </Box>
        )}
      </Stack>
    </Box>
  );
}

interface Tag {
  name: string;
  commit: {
    sha: string;
  };
}

async function getProdTag(
  octokit: Octokit,
  ownerRepo: OwnerRepo
): Promise<Tag | null> {
  const tagPages = octokit.paginate.iterator(octokit.rest.repos.listTags, {
    ...ownerRepo,
    per_page: 100,
  });

  // FIXME un-hardcode
  for await (const { data: tags } of tagPages) {
    for (const tag of tags) {
      if (
        tag.name.startsWith("prod-") &&
        !tag.name.startsWith("prod-revert-")
      ) {
        return tag;
      }
    }
  }

  return null;
}

async function getMasterSha(
  octokit: Octokit,
  ownerRepo: OwnerRepo
): Promise<string> {
  const branch = await octokit.rest.repos.getBranch({
    ...ownerRepo,
    branch: "master",
  });
  return branch.data.commit.sha;
}

async function getCommitComparison(
  octokit: Octokit,
  ownerRepo: OwnerRepo,
  masterSha: string,
  prodSha: string
): Promise<CommitComparison> {
  const comparison = await octokit.request(
    "GET /repos/{owner}/{repo}/compare/{basehead}",
    { ...ownerRepo, basehead: `${prodSha}...${masterSha}` }
  );
  return comparison.data;
}

// Five minutes
const GIT_REF_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function Overview() {
  const octokit = useOctokit();
  const login = useLogin();

  // FIXME un-hardcode
  const ownerRepo = { owner: "reinfer", repo: "platform" };

  const masterSha = useQuery({
    queryKey: ["getMasterSha", { ownerRepo }],
    queryFn: () => getMasterSha(octokit!, ownerRepo),
    refetchInterval: GIT_REF_POLL_INTERVAL_MS,
    enabled: !!octokit,
  });
  const prodTag = useQuery({
    queryKey: ["getProdTag", { ownerRepo }],
    queryFn: () => getProdTag(octokit!, ownerRepo),
    refetchInterval: GIT_REF_POLL_INTERVAL_MS,
    enabled: !!octokit,
  });

  return login.isLoading ? (
    <Skeleton variant="rounded" width={240} height={40} />
  ) : login.isError ? (
    <Alert severity="error">{`${login.error}`}</Alert>
  ) : (
    <OwnerRepoContext.Provider value={ownerRepo}>
      <LoginStatus />
      {masterSha.isError || prodTag.isError ? (
        "Error loading comparison points"
      ) : masterSha.isLoading || prodTag.isLoading ? (
        <Skeleton variant="rounded" width={240} height={40} />
      ) : prodTag.data === null ? (
        "No previous prod release"
      ) : (
        <Comparison masterSha={masterSha.data} prodTag={prodTag.data} />
      )}
    </OwnerRepoContext.Provider>
  );
}

interface ComparisonProps {
  masterSha: string;
  prodTag: Tag;
}

export function Comparison({ masterSha, prodTag }: ComparisonProps) {
  const octokit = useOctokit();
  const ownerRepo = useContext(OwnerRepoContext);
  const prodSha = prodTag.commit.sha;
  const comparison = useQuery({
    queryKey: ["getComparison", { ownerRepo, masterSha, prodSha }],
    queryFn: () => getCommitComparison(octokit!, ownerRepo, masterSha, prodSha),
    enabled: !!octokit,
  });

  return (
    <>
      <Paper elevation={3}>
        <Box padding={2}>
          {comparison.isError ? (
            "error loading comparison"
          ) : comparison.isLoading ? (
            <Stack spacing={1}>
              {Array.from(Array(4)).map((_value, index) => (
                <Skeleton
                  key={index}
                  variant="rounded"
                  width={920}
                  height={60}
                />
              ))}
            </Stack>
          ) : (
            <CommitSummary comparison={comparison.data} />
          )}
        </Box>
      </Paper>
    </>
  );
}

interface CommitSummaryProps {
  comparison: CommitComparison;
}

export function CommitSummary({ comparison }: CommitSummaryProps) {
  const developerCommits = comparison.commits.filter((commit) => {
    // FIXME un-hardcode
    return !(commit.author && commit.author.login === "rebors[bot]");
  });
  developerCommits.reverse();
  const hiddenCommitCount = comparison.commits.length - developerCommits.length;

  return (
    <Stack spacing={1}>
      <CommitTable commits={developerCommits} />
      <Typography variant="caption">
        Showing {developerCommits.length} undeployed commits on{" "}
        <code>master</code> (view the{" "}
        {<Link to={comparison.html_url}>Github comparison</Link>}):
      </Typography>
      <Typography variant="caption">
        {hiddenCommitCount} commits from <code>bors</code> are hidden.
      </Typography>
    </Stack>
  );
}
