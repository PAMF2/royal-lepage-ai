import LeadCaptureForm from "@/components/LeadCaptureForm";
import { notFound } from "next/navigation";

async function getListing(mlsId: string) {
  const key = process.env.IDX_API_KEY!;
  const secret = process.env.IDX_API_SECRET ?? "";
  const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`https://api.simplyrets.com/properties/${mlsId}`, {
    headers: { Authorization: auth, Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return res.json();
}

export default async function ListingPage({
  params,
}: {
  params: { mlsId: string };
}) {
  const listing = await getListing(params.mlsId);
  if (!listing) notFound();

  const price = listing.listPrice?.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          {listing.photos?.length > 0 ? (
            <div className="space-y-2">
              <img
                src={listing.photos[0]}
                alt={listing.address?.full}
                className="w-full rounded-lg object-cover h-72"
              />
              <div className="grid grid-cols-3 gap-2">
                {listing.photos.slice(1, 4).map((p: string, i: number) => (
                  <img
                    key={i}
                    src={p}
                    alt=""
                    className="w-full h-24 object-cover rounded"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-100 rounded-lg h-72 flex items-center justify-center text-gray-400">
              No photos available
            </div>
          )}

          <div className="mt-6">
            <h1 className="text-2xl font-bold">{listing.address?.full}</h1>
            <p className="text-gray-500">{listing.address?.city}</p>
            <p className="text-3xl font-bold text-[#C8102E] mt-2">{price}</p>

            <div className="flex gap-6 mt-4 text-sm text-gray-700">
              <span>
                <strong>{listing.property?.bedrooms}</strong> Bedrooms
              </span>
              <span>
                <strong>{listing.property?.bathrooms}</strong> Bathrooms
              </span>
              {listing.property?.area && (
                <span>
                  <strong>{listing.property.area.toLocaleString()}</strong> sqft
                </span>
              )}
            </div>

            {listing.remarks && (
              <div className="mt-6">
                <h2 className="font-semibold mb-2">About this property</h2>
                <p className="text-gray-600 text-sm leading-relaxed">
                  {listing.remarks}
                </p>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-gray-700">
              {listing.property?.type && (
                <div>
                  <span className="font-medium">Type:</span>{" "}
                  {listing.property.type}
                </div>
              )}
              {listing.property?.yearBuilt && (
                <div>
                  <span className="font-medium">Year Built:</span>{" "}
                  {listing.property.yearBuilt}
                </div>
              )}
              {listing.property?.parking && (
                <div>
                  <span className="font-medium">Parking:</span>{" "}
                  {listing.property.parking}
                </div>
              )}
              {listing.mlsId && (
                <div>
                  <span className="font-medium">MLS#:</span> {listing.mlsId}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="bg-gray-50 rounded-lg p-6 sticky top-6">
            <h2 className="text-lg font-semibold mb-1">
              Interested in this property?
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Book a showing or get more info from our team.
            </p>
            <LeadCaptureForm />
          </div>
        </div>
      </div>
    </main>
  );
}
