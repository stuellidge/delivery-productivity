# User Guide — Delivery Performance Platform

## Who this guide is for

Team leads, stream leads, and anyone who uses the dashboard to understand and improve delivery performance. No technical background required.

---

## 1. Dashboard Overview

The dashboard is divided into four zones:

| Zone | What it shows | Update frequency |
|---|---|---|
| **Real-time** | Current WIP and cycle time | Every 30 seconds |
| **Diagnostic** | Flow efficiency, defect escape rate, PR review turnaround | Every 15 minutes |
| **Trends (DORA)** | Deployment frequency, lead time, change failure rate, MTTR | Every 5 minutes |
| **Forecast** | Monte Carlo probability ranges for sprint completion | Every hour |

You can filter most views by **Delivery Stream** (the team or squad) or **Tech Stream** (the GitHub org/repositories).

---

## 2. WIP and Cycle Time (Real-time)

### WIP by stage

Work-in-progress broken down by workflow stage (e.g. In Progress, In Review, Blocked). **High WIP in a single stage** signals a bottleneck — work is piling up and not flowing through.

**Intended response**: If WIP > team size in any stage, stop starting and start finishing.

### Cycle time

The time from when a ticket enters active work to when it is done. Shown as percentiles (p50, p85).

- **p50** = 50% of tickets finish faster than this
- **p85** = 85% of tickets finish faster than this; this is the "reasonable worst case" used for customer commitments

**Intended response**: A rising p85 means the team is taking on more complex or blocked work. Investigate the outliers — the scatter chart shows individual tickets.

### Cycle time scatter chart

Each dot is a completed work item, plotted by completion date and cycle time in days. Points far above the cluster are outliers worth investigating. Hover over a dot to see the ticket ID.

---

## 3. Flow Efficiency (Diagnostic)

Flow efficiency = active time / (active time + wait time). A score of 100% means no waiting; 25% means 3× as much waiting as working.

**Target**: > 40% is healthy. < 20% suggests significant process friction or batch handoffs.

**Intended response**: If low, investigate stages where tickets spend the most time waiting. Common causes: large PRs that sit in review, blocked dependencies, waiting for stakeholder sign-off.

### Defect Escape Rate

Percentage of completed work items that were subsequently raised as defects. A low rate (< 5%) indicates strong quality controls. A rising rate warrants a review of testing practices and acceptance criteria.

### PR Review Turnaround

Median and p85 time from PR opened to first review. Long turnaround times create bottlenecks in the development flow.

> If this section shows "Suppressed", it means fewer than the minimum number of contributors were active in the window. This is intentional — the platform protects individual privacy when team size is small.

---

## 4. DORA Metrics (Trends)

DORA metrics measure software delivery performance. They are shown per **Tech Stream**.

| Metric | What it measures | Elite benchmark |
|---|---|---|
| **Deployment Frequency** | How often code is deployed to production | Multiple times per day |
| **Lead Time for Changes** | Time from PR opened to production deployment | < 1 hour |
| **Change Failure Rate** | % of deployments that caused an incident or were rolled back | < 5% |
| **MTTR** | Median time to restore service after an incident | < 1 hour |

**Intended response**:

- Low deployment frequency + high lead time → reduce batch size, invest in CI/CD automation
- High change failure rate → invest in testing, feature flags, canary deployments
- High MTTR → improve runbooks, on-call processes, observability

### Reading the trend chart

Each point on the trend chart represents one week. Look for **direction of travel** over 3–4 weeks rather than reacting to individual week fluctuations.

A ⚠ badge next to lead time means the PR-to-ticket linkage rate is below 90% — lead time data may be incomplete. Ask engineers to include ticket IDs in PR titles.

### DORA performance bands

The DORA research programme defines four performance bands:

| Band | Deployment Frequency | Lead Time | CFR | MTTR |
|---|---|---|---|---|
| **Elite** | Multiple/day | < 1 hour | < 5% | < 1 hour |
| **High** | Weekly–monthly | 1 day–1 week | 5–10% | < 1 day |
| **Medium** | Monthly | 1 week–1 month | 10–15% | 1 day–1 week |
| **Low** | Less than monthly | > 1 month | > 15% | > 1 week |

Neither rating is an end state — focus on the direction of travel over time.

---

## 5. Monte Carlo Forecast

The forecast shows probability ranges for sprint completion based on historical throughput.

The chart shows three confidence bands:

- **50% band**: there is a 50% chance the team finishes this many items
- **85% band**: 85% probability — use this for stakeholder commitments
- **95% band**: conservative estimate for high-stakes deadlines

**How to read it**: If the team has 20 items in scope and the 85th-percentile forecast says 15 items by sprint end, there is an 85% chance of completing at least 15 items.

**Important caveats**: The model is based on historical throughput. It assumes the backlog is well-defined and the team composition is stable. Major scope changes or team changes should trigger a manual re-assessment.

**Intended response**: If the forecast is significantly below the committed scope, either reduce scope, add capacity, or reset stakeholder expectations early.

---

## 6. Pulse Survey

The pulse survey measures team sentiment across three dimensions, asked monthly:

| Dimension | What it measures |
|---|---|
| **Pace** | Is the pace of work sustainable? (1 = burnout risk, 5 = comfortable) |
| **Tooling** | Are our tools and processes helping or hindering? |
| **Clarity** | Do I understand what I'm working on and why? |

Scores are on a 1–5 scale. Team results are aggregated — individual scores are never shown to leads.

### How to participate

Navigate to **Survey** in the top menu, complete the three questions, and submit. Takes under 2 minutes.

Surveys are anonymous. Your respondent ID is a cryptographic hash — it cannot be reverse-engineered to identify you.

### How to read trends

- A **downward trend in pace** over 2+ periods is a burnout signal — address workload and priorities
- **Low tooling scores** often precede rising cycle times — investigate process or tool friction
- **Low clarity** correlates with poor sprint planning and unclear acceptance criteria

### Response rate

The platform tracks participation. A response rate below 40% means the data is not statistically reliable. Encourage participation by making surveys visible and demonstrating that results lead to action.

---

## 7. Cross-Stream Intelligence

**Path:** `/cross-stream`

The cross-stream view shows correlations and shared bottlenecks across Tech Streams that share delivery streams or contributors.

### What to look for

- **Shared bottlenecks**: Multiple tech streams showing elevated cycle time in the same period often share a blocked dependency (platform team, QA, security review)
- **PR review concentration**: A high "reviewer concentration" score means one or two people are reviewing most PRs — a bus-factor risk
- **Block count**: Number of times items from this tech stream were identified as blocking another stream in the last 14 days

**Intended response**: Use this view to prioritise cross-team process improvements rather than blaming individual teams.

---

## 8. Data Quality Indicators

The platform shows a data quality warning when key metrics are unreliable:

| Indicator | What it means | What to do |
|---|---|---|
| **PR Linkage Rate < 80%** | Many PRs are not linked to a Jira ticket | Ask engineers to include the ticket ID in PR title or description |
| **Ticket Tagging Rate < 90%** | Work item events arriving without a delivery stream tag | Check Jira project → stream mapping in Admin → Status Mappings |
| **Deployment Traceability < 80%** | Production deployments without a linked ticket | Update deployment pipeline to pass `linked_ticket_id` to the events API |

When data quality is low, treat the corresponding metrics as indicative rather than definitive.

---

## 9. Frequently Asked Questions

**Q: My cycle time looks very high — is something wrong?**

This often means there are tickets that were opened long ago and never closed. Filter by the current sprint to see active work, and close or archive stale tickets in Jira.

**Q: The forecast changes a lot week to week. Is it reliable?**

Forecasts stabilise with more historical data. After 8+ sprints of data, the model becomes reliable. Early on, treat it as directional.

**Q: Why don't I see my team in the dashboard?**

Your team may not have a Delivery Stream configured yet. Ask your platform administrator to add it in Admin → Delivery Streams.

**Q: The pulse survey shows "no data" for my team.**

Either no one on your team has submitted a response this period, or your team's Delivery Stream has not been configured with a team size. Contact your platform administrator.

**Q: My DORA lead time is null / not shown.**

Lead time is computed from the time a PR is opened to when it is deployed to production. This requires:
1. The GitHub webhook to be configured and receiving PR events
2. The PR to include a valid ticket ID (so it can be linked to your delivery stream)
3. A deployment event to be received for the repository

Check the data quality indicators for PR linkage rate.

**Q: Why is the PR review turnaround suppressed?**

The platform requires a minimum number of distinct contributors before showing PR review metrics, to protect individual privacy on small teams. Ask your administrator to check the minimum contributors setting on your tech stream.
