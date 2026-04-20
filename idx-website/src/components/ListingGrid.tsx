import ListingCard from "./ListingCard";

async function getListings() {
  const key = process.env.IDX_API_KEY!;
  const secret = process.env.IDX_API_SECRET ?? "";
  const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(
    "https://api.simplyrets.com/properties?limit=12&sort=listdate",
    {
      headers: { Authorization: auth, Accept: "application/json" },
      next: { revalidate: 300 },
    },
  );
  if (!res.ok) return [];
  return res.json();
}

export default async function ListingGrid() {
  const listings = await getListings();
  if (!listings.length) {
    return (
      <p className="text-gray-500 text-center py-12">
        No listings available right now. Check back soon.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {listings.map((l: Record<string, unknown>) => (
        <ListingCard key={l.mlsId as string} listing={l} />
      ))}
    </div>
  );
}
