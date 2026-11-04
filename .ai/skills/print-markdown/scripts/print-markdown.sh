#!/usr/bin/env bash
# Prints a markdown file from a PR or branch. Without -f, prints the only markdown file changed there.
# If several changed, lists them on stderr and exits 2; rerun with -f to pick one.
# Usage: print-markdown.sh <pr-number-url-or-branch> [-R owner/repo] [-f path]
set -euo pipefail

target="$1"
shift
repo=""
file=""
while getopts "R:f:" opt; do
  case "$opt" in
    R) repo="$OPTARG" ;;
    f) file="$OPTARG" ;;
    *) exit 1 ;;
  esac
done

# Filenames from the GitHub API can carry leading/trailing whitespace and invisible characters
# (bidi marks such as U+200E, zero-width characters, BOM). Matching uses the cleaned name; reading
# uses the exact name as GitHub stores it, because the path on GitHub contains those characters.
clean='def clean: gsub("^[\\s​-‏‪-‮⁠-⁤⁦-⁩﻿]+|[\\s​-‏‪-‮⁠-⁤⁦-⁩﻿]+$"; "");'
changed_markdown="$clean select(.status != \"removed\" and ((.filename | clean) | test(\"\\\\.(md|markdown|mdx)\$\"; \"i\"))) | .filename"

if pr_json="$(gh pr view "$target" ${repo:+--repo "$repo"} --json number,url,headRefOid 2>/dev/null)"; then
  ref="$(jq -r .headRefOid <<<"$pr_json")"
  repo="$(jq -r .url <<<"$pr_json" | sed -E 's#^https://[^/]+/([^/]+/[^/]+)/pull/.*#\1#')"
  number="$(jq -r .number <<<"$pr_json")"
  files="$(gh api --paginate "repos/$repo/pulls/$number/files" --jq ".[] | $changed_markdown")"
else
  ref="$target"
  repo="${repo:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
  base="$(gh repo view "$repo" --json defaultBranchRef --jq .defaultBranchRef.name)"
  files="$(gh api "repos/$repo/compare/$base...$ref" --jq ".files[] | $changed_markdown")"
fi

if [[ -n "$file" ]]; then
  # Map the -f value to the exact name GitHub stored, so the read works. Unknown paths are used as given.
  match="$(printf '%s\n' "$files" | jq -Rr --arg w "$file" "$clean select(clean == (\$w | clean)) | ." | head -n 1)"
  file="${match:-$file}"
else
  if [[ -z "$files" ]]; then
    echo "No markdown files changed in $target" >&2
    exit 1
  fi
  if [[ "$(wc -l <<<"$files")" -gt 1 ]]; then
    echo "$files" >&2
    exit 2
  fi
  file="$files"
fi

gh repo read-file "$file" --repo "$repo" --ref "$ref"
