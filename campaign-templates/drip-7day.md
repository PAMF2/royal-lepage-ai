# Campaign: 7-Day Drip (No Response)

For leads that don't reply to the instant SMS. Runs automatically.

---

## Day 1 — SMS (sent 4 hours after no response)

```
Hey {{contact.firstName}}! Just wanted to make sure my message got through. The market in {{contact.city}} has been moving fast lately — a lot of great homes coming and going. Still interested in buying? — Homie, Royal LePage
```

---

## Day 3 — Email

**Subject:** A few listings I think you'll like, {{contact.firstName}}

```
Hi {{contact.firstName}},

I'm Homie, the AI assistant at Royal LePage. I noticed you were browsing listings recently and wanted to share a few properties that match what you might be looking for in {{contact.city}}.

[IDX listing 1 — dynamically inserted]
[IDX listing 2 — dynamically inserted]
[IDX listing 3 — dynamically inserted]

The market is active right now, and good homes tend to move quickly. If any of these catch your eye or if you'd like me to search for something more specific, just reply to this email or shoot me a text.

No pressure at all — just here to help when you're ready.

Homie
AI Assistant | Royal LePage
```

---

## Day 7 — SMS

```
Hi {{contact.firstName}}, last check-in from my end! If the timing isn't right yet, no worries at all — I can set you up with a listing alert so you hear about new homes in {{contact.city}} the moment they hit the market. Want me to do that?
```

---

## Day 14 — Move to Nurture

Tag contact as `nurture`, remove from drip, enroll in monthly nurture campaign.
