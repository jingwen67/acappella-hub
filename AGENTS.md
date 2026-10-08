# CUCAC Hub maintenance

CUCAC Hub officially launched as v1.0 on 2026-10-08 (America/New_York). The production code currently lives on `feature/vercel-independent-hub`. Verify the actual deployment branch before changing it. Preserve existing accounts and data during updates.

## Required release log workflow

The owner requests a game-style cumulative version log. For every completed feature, user-visible improvement, or bug fix:

1. Read `CHANGELOG.md` before editing its entries.
2. Append a concise dated entry under `下一版本 · Upcoming release`. Describe the final behavior and identify whether it is deployed or pending deployment. Do not log plans or unverified fixes as completed.
3. Keep changes grouped as features, improvements, and fixes when enough entries make grouping helpful. Merge related entries instead of repeating work history.
4. Small deployments do not automatically change the announced product version. When the owner asks to release a new version, or a substantial batch warrants proposing one, prepare a concrete version number and concise member-facing release summary. Move the accepted batch into a dated version section and reset the upcoming section when the release is authorized.
5. Use v1.1, v1.2, etc. for feature batches, v1.0.1 etc. for separately announced fixes, and v2.0 for major changes. Dates use America/New_York.
6. Report the changelog update in the completion message. Do not send emails, group messages, or other external announcements without explicit authorization.

`CHANGELOG.md` is the source of truth for announced versions and cumulative changes. This workflow starts after v1.0; the launch baseline is already documented.
