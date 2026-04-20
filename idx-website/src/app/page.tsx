import ListingGrid from "@/components/ListingGrid";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import SearchBar from "@/components/SearchBar";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="bg-[#C8102E] text-white py-4 px-6 flex items-center justify-between">
        <div className="font-bold text-xl">Royal LePage</div>
        <nav className="hidden md:flex gap-6 text-sm">
          <a href="/listings" className="hover:underline">
            Browse Listings
          </a>
          <a href="/about" className="hover:underline">
            About
          </a>
          <a href="/contact" className="hover:underline">
            Contact
          </a>
        </nav>
      </header>

      <section className="bg-gray-50 py-16 px-6 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Find Your Next Home
        </h1>
        <p className="text-gray-600 mb-8">
          Search thousands of listings across the MLS
        </p>
        <SearchBar />
      </section>

      <section className="px-6 py-12 max-w-7xl mx-auto">
        <h2 className="text-2xl font-semibold mb-6">New Listings</h2>
        <ListingGrid />
      </section>

      <section className="bg-gray-50 py-12 px-6">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-semibold text-center mb-2">
            Get Matched With Listings
          </h2>
          <p className="text-center text-gray-600 mb-8">
            Tell us what you're looking for and we'll send you matches as they
            hit the market.
          </p>
          <LeadCaptureForm />
        </div>
      </section>

      <footer className="bg-gray-900 text-white text-center py-6 text-sm">
        <p>© {new Date().getFullYear()} Royal LePage. All rights reserved.</p>
        <p className="mt-1 text-gray-400">
          MLS® data provided under license from the applicable real estate
          board.
        </p>
      </footer>
    </main>
  );
}
