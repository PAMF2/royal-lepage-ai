# Campaign: Appointment Reminder

Triggered when an appointment is booked. Reduces no-shows.

---

## 24 Hours Before — SMS

```
Hi {{contact.firstName}}! Just a reminder that you have a showing tomorrow at {{appointment.time}} for {{appointment.address}}. Your agent {{agent.name}} will meet you there. Reply CONFIRM to confirm or call us to reschedule. See you tomorrow! 🏡
```

---

## 1 Hour Before — SMS

```
Hi {{contact.firstName}}, see you in an hour at {{appointment.address}}! {{agent.name}} will be there. Any questions? Reply here anytime.
```

---

## Post-Showing (24 hours after) — SMS

```
Hi {{contact.firstName}}, hope the showing went well! What did you think of {{appointment.address}}? Happy to schedule more viewings or answer any questions — just let me know 😊
```

---

## If No-Show — SMS (30 min after scheduled time)

```
Hi {{contact.firstName}}, we missed you at today's showing! No worries — life happens. Want to reschedule? I can find another time that works for you.
```
