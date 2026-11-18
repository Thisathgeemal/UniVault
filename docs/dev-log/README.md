# UniVault Development Log

Day-by-day record of UniVault development across the five sprints, with links to the evidence
(screenshots, test output, commits) behind each entry. Design decisions are recorded separately
in [decisions.md](decisions.md).

## Sprints

| Sprint | Dates (2026)           | Review             | Focus                                             | Log                        |
| ------ | ---------------------- | ------------------ | ------------------------------------------------- | -------------------------- |
| S1     | Mon 16 – Sat 21 Nov    | Sun 22 Nov         | Foundations, cryptographic core and issuer portal | [sprint-1.md](sprint-1.md) |
| S2     | Mon 23 – Sat 28 Nov    | Sun 29 Nov         | Mobile wallet and credential issuance             | sprint-2.md (to be added)  |
| S3     | Mon 30 Nov – Sat 5 Dec | Sun 6 Dec          | Verifier portal and selective disclosure          | sprint-3.md (to be added)  |
| S4     | Mon 7 – Sat 12 Dec     | Sun 13 Dec         | AI anomaly detection and additional features      | sprint-4.md (to be added)  |
| S5     | Mon 14 – Sat 19 Dec    | Sun 20 Dec (final) | Testing, security hardening and release           | sprint-5.md (to be added)  |

Other files:

- [decisions.md](decisions.md): numbered design decisions with context and reasons.
- [evidence/](evidence/): screenshots, test reports and other files that entries link to.

## How to write a daily entry

Add one entry per working day under that day's heading in the current sprint file. Write it at
the end of the day, while the details are fresh. Use four parts:

- **Done:** what you finished today. Be specific ("RS256 signing of SD-JWT issuer JWT, with unit
  tests"), not vague ("worked on crypto").
- **Next:** what you plan to do on the next working day.
- **Blockers:** anything stopping progress and what you are doing about it. Write "None" if
  there are none.
- **Evidence:** links that prove the work: commit hashes, files in `evidence/`, test output, PRs.

Tips:

- Name evidence files `s<sprint>-<yyyy-mm-dd>-<short-name>.<ext>`, e.g.
  `evidence/s1-2026-11-17-signing-tests.png`, and link them with a relative path.
- Never put secrets, private keys, real personal data or `.env` contents in the log or in
  screenshots.
- When you make a design choice that affects more than one day's work, add it to
  [decisions.md](decisions.md) and link the decision number from the daily entry.
- At the end of each sprint, fill in the Testing evidence, Sprint review and Retrospective
  sections before starting the next sprint file.
