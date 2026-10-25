#!/usr/bin/env bash
# Prints the PR's review threads and review bodies that still await the PR author: unresolved threads whose last
# comment isn't the author's or whose comments are all the author's own notes, and non-empty review bodies.
# Bots and the author's own comments are included.
# Usage: pending-comments.sh [pr-number-or-url]  (defaults to the current branch's PR)
set -euo pipefail

pr_json="$(gh pr view ${1:+"$1"} --json number,url,headRepository,headRepositoryOwner)"
number="$(jq -r .number <<<"$pr_json")"
owner="$(jq -r .headRepositoryOwner.login <<<"$pr_json")"
repo="$(jq -r .headRepository.name <<<"$pr_json")"

gh api graphql -F owner="$owner" -F repo="$repo" -F number="$number" -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      url
      author { login }
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          path
          line
          comments(first: 50) { nodes { author { __typename login } body url createdAt } }
        }
      }
      reviews(first: 100) { nodes { author { __typename login } state body url submittedAt } }
    }
  }
}' --jq '
  .data.repository.pullRequest as $pr
  | $pr.author.login as $me
  | {
      pr: $pr.url,
      author: $me,
      threads: [
        $pr.reviewThreads.nodes[]
        | select(.isResolved | not)
        | select(.comments.nodes[-1].author.login != $me or all(.comments.nodes[]; .author.login == $me))
        | {path, line, isOutdated, url: .comments.nodes[0].url,
           comments: [.comments.nodes[] | {author: .author.login, body}]}
      ],
      reviews: [
        $pr.reviews.nodes[]
        | select(.body != "")
        | {author: .author.login, state, body, url}
      ]
    }'
