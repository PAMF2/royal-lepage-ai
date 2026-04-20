# Campaign: Monthly Nurture

For long-term leads not ready to buy yet. Keeps Royal LePage top of mind.

---

## Monthly Email — Market Update

**Subject:** {{contact.city}} market update — {{month}} {{year}}

```
Hi {{contact.firstName}},

Here's a quick snapshot of what's happening in the {{contact.city}} real estate market this month:

🏡 New listings this month: [dynamically inserted from IDX]
📉 Average days on market: [dynamically inserted]
💰 Median sale price: [dynamically inserted]

A few properties that might interest you:
[IDX listing 1]
[IDX listing 2]

As always, no pressure — just keeping you in the loop. When the timing is right for you, I'm here.

Homie
AI Assistant | Royal LePage
```

---

## Trigger Events (send immediately, outside monthly cadence)

These override the monthly schedule and trigger an immediate SMS:

1. **New listing** — matches lead's city + budget + beds
   ```
   Hi {{contact.firstName}}, a new home just listed in {{contact.city}} that matches what you were looking for — ${{price}}, {{beds}}bd. Want the details?
   ```

2. **Price reduction** — on a listing they previously viewed or in their area/budget
   ```
   Hi {{contact.firstName}}, a home in {{contact.city}} just dropped to ${{newPrice}} — it was ${{oldPrice}} before. Might be worth a look!
   ```

3. **Rate drop** (if mortgage rate data available)
   ```
   Hi {{contact.firstName}}, mortgage rates just dropped again — might be a good time to revisit your buying plans. Want to chat about what you can qualify for?
   ```
