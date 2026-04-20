"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBar() {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [beds, setBeds] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (beds) params.set("beds", beds);
    router.push(`/listings?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSearch}
      className="flex flex-wrap gap-3 justify-center max-w-3xl mx-auto"
    >
      <input
        type="text"
        placeholder="City or neighbourhood"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className="border rounded px-4 py-2 flex-1 min-w-[180px]"
      />
      <input
        type="number"
        placeholder="Min price"
        value={minPrice}
        onChange={(e) => setMinPrice(e.target.value)}
        className="border rounded px-4 py-2 w-32"
      />
      <input
        type="number"
        placeholder="Max price"
        value={maxPrice}
        onChange={(e) => setMaxPrice(e.target.value)}
        className="border rounded px-4 py-2 w-32"
      />
      <select
        value={beds}
        onChange={(e) => setBeds(e.target.value)}
        className="border rounded px-4 py-2"
      >
        <option value="">Any beds</option>
        <option value="1">1+</option>
        <option value="2">2+</option>
        <option value="3">3+</option>
        <option value="4">4+</option>
      </select>
      <button
        type="submit"
        className="bg-[#C8102E] text-white px-6 py-2 rounded hover:bg-red-800 font-medium"
      >
        Search
      </button>
    </form>
  );
}
