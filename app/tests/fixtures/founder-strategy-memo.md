# Strategy Memo: Should We Sunset Anchor Classic?

**To:** Leadership Team
**From:** Jordan Reyes, Founder and CEO
**Date:** March 3, 2027
**Re:** Sunsetting our legacy on-premise product

## Bottom Line

I recommend we sunset Anchor Classic, our legacy on-premise analytics product, with a 12-month customer migration runway ending March 2028. Anchor Classic now accounts for less than 8% of total revenue but consumes nearly a third of engineering time. Every quarter we keep it alive is a quarter we are not investing in Anchor Cloud, the product driving 92% of new bookings.

## Background

We shipped Anchor Classic in 2019 as our first product. It found a real niche among healthcare and finance customers who could not put analytics data in the cloud. Anchor Cloud launched in 2023 and has grown into the primary product for the whole company. Today we run two full stacks, two release trains, and two support playbooks for a product line that is shrinking every quarter.

## The Decision

The question before this team is: should Anchor Classic be sunset, and if so, on what timeline?

## Options Considered

### Option A: Immediate sunset, no migration support

Stop selling Anchor Classic today and end support within 90 days. Fastest path to reclaiming engineering time, but it burns trust with our most loyal enterprise accounts and likely triggers renewal cancellations across the board.

### Option B: Sunset with a 12-month migration runway

Stop selling Anchor Classic today, commit to supporting existing customers through March 2028, and fund a dedicated migration team to move customers onto Anchor Cloud. This is the option I am recommending.

### Option C: Keep maintaining Anchor Classic indefinitely

Continue selling and supporting both products. Preserves current revenue and avoids customer disruption, but locks in the current 30% engineering tax indefinitely and slows the Anchor Cloud roadmap.

## Evidence

- Anchor Classic revenue has declined for six consecutive quarters, from $2.1M ARR in Q1 2026 to $1.4M ARR in Q4 2026.
- Anchor Classic now represents 8% of total company revenue, down from 34% two years ago.
- Engineering time-tracking shows the on-premise stack consumes 31% of sprint capacity despite generating 8% of revenue.
- Anchor Cloud drove 92% of new bookings in the last two quarters.
- Twenty-three of our thirty-one Anchor Classic customers have healthcare or finance compliance requirements that originally justified on-premise deployment.

## Claims

The declining revenue and disproportionate engineering cost of Anchor Classic mean continuing to maintain it in its current form is no longer defensible. The compliance requirements that justified on-premise deployment in 2019 are now met by the new private-VPC deployment option in Anchor Cloud, which removes the original reason many customers chose Anchor Classic.

## Risks

- Customer churn risk: some of our largest healthcare accounts may leave rather than migrate, especially if the private-VPC option does not meet their compliance needs. Likelihood: medium. Impact: high.
- Competitor opportunity risk: a sunset announcement gives competitors an opening to court our Anchor Classic customer base during the migration window. Likelihood: medium. Impact: medium.

## Assumptions

- We are assuming the private-VPC deployment option in Anchor Cloud, currently in beta, will be generally available before the migration runway begins in earnest.
- We are assuming the twenty-three compliance-driven customers will accept private-VPC as a substitute for fully on-premise deployment; we have not validated this with all of them yet.

## Tradeoffs

Across all three options, the primary axes of comparison are engineering time reclaimed and customer trust preserved. Option A reclaims engineering time fastest but preserves the least customer trust. Option C preserves the most trust but reclaims no engineering time.

## Action Items

- Sarah Kim (VP Engineering) will finalize the private-VPC general-availability date by March 20, 2027.
- Marcus Webb (Head of Customer Success) will personally call all thirty-one Anchor Classic customers before the sunset announcement, starting March 10, 2027.
- Priya Nair (Head of Product) will draft the customer-facing migration guide by April 1, 2027.

## Open Questions

- Should we offer a discount on Anchor Cloud pricing to Anchor Classic customers who migrate before the runway ends?
- What is our contingency plan if more than five of the twenty-three compliance-driven customers reject the private-VPC option?

## Stakeholders

This decision affects Sarah Kim (VP Engineering), Marcus Webb (Head of Customer Success), Priya Nair (Head of Product), and the thirty-one Anchor Classic account owners on the Customer Success team.
