# User Guide — Delivery Performance Platform

## Who this guide is for

Team leads, stream leads, and anyone who uses the dashboard to understand and improve delivery performance. No technical background required.

---

## 1. Dashboard Overview

The dashboard is divided into four zones:

| Zone | What it shows | Update frequency |
|---|---|---|
| **Real-time** | Current WIP and cycle time | Every 30 seconds |
| **Diagnostic** | Flow efficiency over a rolling window | Every 15 minutes |
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

**Intended response**: A rising p85 means the team is taking on more complex or blocked work. Investigate the outliers.

---

## 3. Flow Efficiency (Diagnostic)

Flow efficiency = active time / (active time + wait time). A score of 100% means no waiting; 25% means 3× as much waiting as working.

**Target**: > 40% is healthy. < 20% suggests significant process friction or batch handoffs.

**Intended response**: If low, investigate stages where tickets spend the most time waiting. Common causes: large PRs that sit in review, blocked dependencies, waiting for stakeholder sign-off.

---

## 4. DORA Metrics (Trends)

DORA metrics measure software delivery performance. They are shown per **Tech Stream**.

| Metric | What it measures | Elite benchmark |
|---|---|---|
| **Deployment Frequency** | How often code is deployed to production | Multiple times per day |
| **Lead Time for Changes** | Time from code commit to production | < 1 hour |
| **Change Failure Rate** | % of deployments that cause an incident | < 5% |
| **MTTR** | Mean time to restore service after an incident | < 1 hour |

**Intended response**:
- Low deployment frequency + high lead time → reduce batch size, invest in CI/CD automation
- High change failure rate → invest in testing, feature flags, canary deployments
- High MTTR → improve runbooks, on-call processes, observability

---

## 5. Monte Carlo Forecast

The forecast shows probability ranges for sprint completion based on historical throughput.

The chart shows three confidence bands:
- **50% band**: there is a 50% chance the team finishes this many items
- **85% band**: 85% probability — use this for stakeholder commitments
- **95% band**: conservative estimate for high-stakes deadlines

**How to read it**: If the team has 20 items in scope and the 85th-percentile forecast says 15 items by sprint end, that means there is an 85% chance of completing at least 15 items.

**Important caveats**: The model is based on historical throughput. It assumes the backlog is well-defined and the team composition is stable. Major scope changes or team changes should trigger a manual re-assessment.

**Intended response**: If the forecast is significantly below the committed scope, either reduce scope, add capacity, or reset stakeholder expectations early.

---

## 6. Pulse Survey

The pulse survey measures team health across four dimensions, asked weekly:

| Dimension | What it measures |
|---|---|
| **Satisfaction** | How satisfied am I with my work this week? |
| **Confidence** | How confident am I that we'll hit our goals? |
| **Impediment** | How much are obstacles slowing me down? (inverted: higher = fewer impediments) |
| **Autonomy** | How much control do I have over my own work? |

Scores are on a 1–5 scale. Team results are aggregated (individual scores are never shown to leads).

### How to read trends

- A **downward trend in satisfaction or confidence** over 3+ periods warrants a team retrospective
- A **spike in impediment score** often precedes a drop in throughput — act early
- **Low autonomy** correlates with micromanagement or process overhead — worth discussing in 1:1s

### Response rate

The system tracks participation. A response rate below 40% means the data is not statistically reliable. Encourage participation by making surveys short (< 2 minutes) and demonstrating that results lead to action.

**How to participate**: Navigate to **Survey** in the top menu, complete the four questions, submit. Takes under 2 minutes.

---

## 7. Cross-Stream Intelligence

The cross-stream view shows correlations and shared bottlenecks across Tech Streams that share delivery streams or contributors.

### What to look for

- **Shared bottlenecks**: Multiple tech streams showing elevated cycle time in the same period often share a blocked dependency (platform team, QA, security review)
- **PR review concentration**: A high "reviewer concentration" score means one or two people are reviewing most PRs — a bus-factor risk
- **Linkage rate**: The proportion of PRs linked to a Jira ticket. Low linkage makes it harder to trace deployment failures to their cause

**Intended response**: Use this view to prioritise cross-team process improvements rather than blaming individual teams.

---

## 8. Data Quality Indicators

The platform shows a data quality warning when key metrics are unreliable:

| Indicator | What it means | What to do |
|---|---|---|
| **PR Linkage Rate < 80%** | Many PRs are not linked to a Jira ticket | Ask engineers to include the ticket ID in PR title or description |
| **Ticket Tagging Rate < 90%** | Work item events arriving without a delivery stream tag | Check Jira project → stream mapping in Admin → Status Mappings |
| **Deployment Traceability < 80%** | Production deployments without a linked ticket | Update deployment pipeline to pass `linked_ticket_id` to the API |

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

**Q: How do I interpret a DORA score of "Elite" vs "High"?**
These are industry benchmarks from the DORA research programme. "Elite" means you're in the top tier globally. "High" is strong but has room for improvement. Neither rating is an end state — focus on the direction of travel (improving or declining) over time.
