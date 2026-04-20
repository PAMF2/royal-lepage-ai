"use client";
import { useState } from "react";

export default function LeadCaptureForm() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
    budget: "",
    timeline: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">🏡</div>
        <h3 className="text-xl font-semibold mb-2">You're on the list!</h3>
        <p className="text-gray-600">
          We'll be in touch shortly with listings that match what you're looking
          for.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <input
          required
          placeholder="Your name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border rounded px-4 py-2 col-span-2"
        />
        <input
          required
          type="tel"
          placeholder="Phone number"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="border rounded px-4 py-2"
        />
        <input
          required
          type="email"
          placeholder="Email address"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border rounded px-4 py-2"
        />
        <input
          placeholder="Target city/area"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
          className="border rounded px-4 py-2"
        />
        <input
          placeholder="Budget (e.g. $600k–$800k)"
          value={form.budget}
          onChange={(e) => setForm({ ...form, budget: e.target.value })}
          className="border rounded px-4 py-2"
        />
        <select
          value={form.timeline}
          onChange={(e) => setForm({ ...form, timeline: e.target.value })}
          className="border rounded px-4 py-2 col-span-2"
        >
          <option value="">When are you looking to buy?</option>
          <option value="asap">As soon as possible</option>
          <option value="1-3mo">1–3 months</option>
          <option value="3-6mo">3–6 months</option>
          <option value="6mo+">6+ months</option>
          <option value="just-browsing">Just browsing</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#C8102E] text-white py-3 rounded font-semibold hover:bg-red-800 disabled:opacity-50"
      >
        {loading ? "Sending..." : "Get Matched With Listings"}
      </button>
      <p className="text-xs text-center text-gray-400">
        By submitting you agree to be contacted by a Royal LePage
        representative.
      </p>
    </form>
  );
}
