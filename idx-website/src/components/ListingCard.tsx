import Link from "next/link";

interface Listing {
  mlsId: string;
  listPrice: number;
  address: { full: string; city: string };
  property: { bedrooms: number; bathrooms: number; area: number; type: string };
  photos: string[];
}

export default function ListingCard({ listing }: { listing: Listing }) {
  const photo = listing.photos?.[0] ?? "/placeholder.jpg";
  const price = listing.listPrice?.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });

  return (
    <Link
      href={`/listings/${listing.mlsId}`}
      className="group block border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="relative h-48 overflow-hidden">
        <img
          src={photo}
          alt={listing.address?.full ?? "Property"}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-2 left-2 bg-[#C8102E] text-white text-xs font-semibold px-2 py-1 rounded">
          {listing.property?.type ?? "Residential"}
        </div>
      </div>
      <div className="p-4">
        <p className="text-lg font-bold text-gray-900">{price}</p>
        <p className="text-sm text-gray-600 truncate">
          {listing.address?.full}
        </p>
        <p className="text-xs text-gray-500">{listing.address?.city}</p>
        <div className="flex gap-3 mt-2 text-xs text-gray-600">
          <span>{listing.property?.bedrooms ?? 0} bd</span>
          <span>{listing.property?.bathrooms ?? 0} ba</span>
          {listing.property?.area ? (
            <span>{listing.property.area.toLocaleString()} sqft</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
