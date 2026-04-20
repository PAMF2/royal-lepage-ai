# Campaign: Reactivation (Dormant 30d+)

Triggered by the reactivation engine when a new listing, price drop, or market event matches a dormant lead's criteria.

---

## Touch 1 — SMS (AI-generated, personalized per lead)

Generated dynamically by `reactivation/src/index.ts` using Claude Haiku.

Example outputs:
```
Hi Sarah! Noticed a price drop on a 3bd in Westmount that fits your budget — down to $649k. Worth a look? 🏡
```
```
Hey Marcus, a gorgeous new listing just hit in NDG — exactly the size you were looking for. Want me to send the details?
```
```
Hi Jennifer, market's shifting in Outremont — a few more homes in your range just came available. Still in the hunt?
```

---

## Touch 2 — Email (Day 3, if no response to SMS)

**Subject:** New listings matching what you were looking for, {{contact.firstName}}

```
Hi {{contact.firstName}},

It's been a little while — hope you're doing well! I wanted to reach out because there's been some new activity in {{contact.city}} that matches what you were looking for when we last spoke.

[Dynamically inserted: 2-3 listings matching their criteria]

The market has shifted since we last connected, and there are some solid options available right now. If your plans have changed, no worries — but if you're still thinking about making a move, I'd love to help.

Just reply here or send me a text anytime.

Homie
AI Assistant | Royal LePage
```

---

## Touch 3 — SMS (Day 7, final)

```
{{contact.firstName}}, just one more check-in! If the timing isn't right, I can set up a quiet listing alert for {{contact.city}} and reach out when something perfect comes along. Want me to keep an eye out for you?
```

---

## After Touch 3 — No Response

Tag as `long-term-nurture`. Enroll in monthly market update only. No more active outreach for 60 days.
