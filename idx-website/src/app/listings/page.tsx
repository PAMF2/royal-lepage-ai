import ListingCard from "@/components/ListingCard";
import SearchBar from "@/components/SearchBar";

async function searchListings(params: Record<string, string>) {
  const key = process.env.IDX_API_KEY!;
  const secret = process.env.IDX_API_SECRET ?? "";
  const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  const url = new URL("https://api.simplyrets.com/properties");
  if (params.city) url.searchParams.set("cities", params.city);
  if (params.minPrice) url.searchParams.set("minprice", params.minPrice);
  if (params.maxPrice) url.searchParams.set("maxprice", params.maxPrice);
  if (params.beds) url.searchParams.set("minbeds", params.beds);
  url.searchParams.set("limit", "24");
  const res = await fetch(url.toString(), {
    headers: { Authorization: auth },
    next: { revalidate: 120 },
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const listings = await searchListings(searchParams);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">
        {searchParams.city
          ? `Listings in ${searchParams.city}`
          : "All Listings"}
      </h1>
      <div className="mb-8">
        <SearchBar />
      </div>
      {listings.length === 0 ? (
        <p className="text-center text-gray-500 py-20">
          No listings found. Try adjusting your search.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {listings.length} listings found
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {listings.map((l: any) => (
              <ListingCard key={l.mlsId} listing={l} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
