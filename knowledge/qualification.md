# LPMAMA Qualification Guide — Homie AI

LPMAMA is the qualification framework used to assess lead readiness and route them to the right agent. Each letter represents a key dimension of the lead's situation.

Homie should gather all 6 dimensions naturally through conversation — never as a rapid-fire questionnaire. One question at a time, spaced across the conversation.

---

## L — Location

**What to uncover:**
- Which city, neighbourhood, or area are they targeting?
- Do they have commute requirements (transit access, highway proximity)?
- Are school districts a factor (families with children)?
- Urban vs suburban vs rural preference?
- Flexibility on location, or strictly fixed?

**Sample questions:**
- "Do you have a particular neighbourhood in mind, or are you open to a few different areas?"
- "Is proximity to work or transit important for you?"
- "Are school districts a factor in your search?"

**CRM field:** `city` (custom field in GHL)

---

## P — Price

**What to uncover:**
- What's their budget range (min/max)?
- How much do they have for a down payment?
- Have they factored in closing costs (1.5–4%)?
- Are they pre-approved for a specific amount?
- Is the budget firm or flexible if the right property comes along?

**Sample questions:**
- "Do you have a rough budget in mind for your purchase?"
- "Have you had a chance to connect with a lender or mortgage broker yet?"
- "Are you thinking more condos in the $500–700K range, or detached homes?"

**CRM field:** `budget` (custom field in GHL)

---

## M — Motivation

**What to uncover:**
- Why are they buying or selling now?
- Is it lifestyle-driven (more space, new neighbourhood), family-driven (kids, aging parents), or investment-driven?
- Is there a life event triggering the move (new job, divorce, growing family, retirement)?
- How emotionally invested are they in the move?

**Sample questions:**
- "What's got you thinking about making a move?"
- "Is this for a growing family, or more of an investment play?"
- "Is there a specific reason you're looking now versus waiting?"

**CRM field:** `motivation` (custom field in GHL)

---

## A — Agent

**What to uncover:**
- Are they currently working with a real estate agent?
- If yes: Is the relationship exclusive? Signed buyer's rep agreement?
- If no: Are they open to working with a Royal LePage agent?
- Have they had a bad experience with an agent before?

**Sample questions:**
- "Are you currently working with an agent, or still exploring your options?"
- "Have you been in touch with anyone from Royal LePage before?"

**Action on positive signal:** If no agent → move toward agent introduction and appointment booking.
**Action on existing agent:** Tag `has-agent`, do not push — leave door open.

**CRM field:** Tracked via tags (`has-agent`, `no-agent`, etc.)

---

## M — Mortgage

**What to uncover:**
- Pre-approved, pre-qualified, or not started?
- If pre-approved: What amount? Which lender or broker?
- If not started: Do they need a referral to a mortgage broker?
- Cash buyer? (High priority lead)
- Are they a first-time buyer? (FHSA, CMHC eligibility)

**Pre-approval vs Pre-qualification:**
- Pre-qualification = quick estimate based on self-reported income/debt
- Pre-approval = lender has reviewed documents and issued a conditional commitment (much stronger)

**Sample questions:**
- "Have you connected with a mortgage broker or lender yet?"
- "Do you have a pre-approval in place, or is that something you're still working on?"
- "Are you a first-time buyer? There are some great programs that might apply to you."

**CRM field:** `mortgage_status` (custom field in GHL — values: `pre-approved`, `pre-qualified`, `not-started`, `cash-buyer`)

---

## A — Appointment

**What to uncover:**
- Are they ready to meet with an agent?
- Preferred contact method: call, text, video, in-person?
- Preferred times: mornings, evenings, weekends?
- Virtual or in-person showing preference?
- Is there urgency (need to move by a certain date)?

**Sample questions:**
- "Would you be open to a quick call with one of our agents to walk through your options?"
- "Are mornings or evenings generally better for you?"
- "Would you prefer a virtual meeting or in-person?"

**Booking:** Appointments are booked through the agent's GoHighLevel calendar. Homie should confirm date, time, and contact method, then log in GHL.

**CRM field:** `timeline` (custom field in GHL — also tracked via appointment tags and GHL calendar)

---

## Lead Scoring by LPMAMA Completion

| Fields Answered | Score Boost | Signal |
|-----------------|-------------|--------|
| 0 of 5          | +0 pts      | Cold   |
| 1–2 of 5        | +5–10 pts   | Warm   |
| 3–4 of 5        | +15–20 pts  | Hot    |
| 5 of 5          | +25 pts     | Ready  |

Each answered field = +5 pts in the scoring model (see `scoring.ts`).

---

## Conversation Flow

1. Start with **Motivation** — easiest to answer, most revealing
2. Move to **Location** — narrows the search
3. Then **Price** — qualifies financial readiness
4. Then **Mortgage** — confirms buying power
5. Then **Agent** — identifies competition
6. End with **Appointment** — conversion goal

Never ask all 6 in one message. Spread them naturally over 2–4 exchanges. If a lead volunteers information, acknowledge it and move on — don't re-ask questions already answered.
