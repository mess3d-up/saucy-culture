import React, { useState } from 'react';
import { Heart, Menu, Search, ShoppingBag, X } from 'lucide-react';
import { MASCOT_GORILLA_IMG } from '../data/catalog';

interface NavbarProps {
  announcementText: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  cartCount: number;
  wishlistCount: number;
  onOpenCart: () => void;
  onOpenWishlist: () => void;
  onOpenTrackOrder: () => void;
  onNavigateSection: (sectionId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  announcementText,
  searchQuery,
  onSearchChange,
  cartCount,
  wishlistCount,
  onOpenCart,
  onOpenWishlist,
  onOpenTrackOrder,
  onNavigateSection,
}) => {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLinkClick = (sectionId: string) => {
    setMobileMenuOpen(false);
    onNavigateSection(sectionId);
  };

  return (
    <>
      {!bannerDismissed && (
        <div className="bg-[#111111] text-white text-[11px] font-semibold tracking-[0.14em] uppercase px-4 py-2 flex items-center justify-center relative">
          <p className="text-center pr-6 truncate">{announcementText}</p>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss announcement"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-white/15 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-neutral-200 text-[#111111]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4 lg:gap-6">
          {/* Zone 1: Brand Lockup */}
          <button
            type="button"
            onClick={() => handleLinkClick('hero')}
            className="flex items-center gap-2 sm:gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#e0531f] rounded cursor-pointer"
          >
            <img
              src={MASCOT_GORILLA_IMG}
              alt="Saucy Culture Mascot"
              referrerPolicy="no-referrer"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded object-cover border border-neutral-200 bg-neutral-100"
            />
            <span className="font-graffiti text-[17px] sm:text-2xl tracking-wide text-[#111111] leading-none">
              SAUCY CULTURE
            </span>
          </button>

          {/* Zone 2: Single-line Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-6 text-xs font-bold tracking-[0.12em] uppercase text-neutral-700"
          >
            <button
              type="button"
              onClick={() => handleLinkClick('shop')}
              className="hover:text-[#e0531f] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#e0531f] cursor-pointer"
            >
              Shop
            </button>
            <button
              type="button"
              onClick={() => handleLinkClick('collections')}
              className="hover:text-[#e0531f] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#e0531f] cursor-pointer"
            >
              Collections
            </button>
            <button
              type="button"
              onClick={() => handleLinkClick('the-court')}
              className="hover:text-[#e0531f] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#e0531f] cursor-pointer"
            >
              The Court
            </button>
            <button
              type="button"
              onClick={() => handleLinkClick('our-circle')}
              className="hover:text-[#e0531f] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#e0531f] cursor-pointer"
            >
              Our Circle
            </button>
            <button
              type="button"
              onClick={onOpenTrackOrder}
              className="hover:text-[#e0531f] transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent hover:border-[#e0531f] cursor-pointer"
            >
              Track Order
            </button>
          </nav>

          {/* Zone 3: Search + Wishlist + Bag */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="hidden md:flex items-center bg-neutral-100 border border-neutral-200 focus-within:border-[#111111] focus-within:bg-white rounded px-3 py-1.5 w-40 lg:w-48 transition-colors">
              <Search className="w-3.5 h-3.5 text-neutral-500 mr-2 shrink-0" />
              <label htmlFor="store-search" className="sr-only">
                Search products
              </label>
              <input
                id="store-search"
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search drop..."
                className="bg-transparent text-xs text-[#111111] placeholder:text-neutral-500 focus:outline-none w-full"
              />
            </div>

            <button
              type="button"
              onClick={onOpenWishlist}
              aria-label={`Open wishlist (${wishlistCount} saved)`}
              className="relative flex items-center gap-1 sm:gap-1.5 bg-white hover:bg-neutral-50 border border-neutral-300 text-[#111111] px-2 sm:px-3 py-1.5 sm:py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Heart
                className={`w-4 h-4 ${
                  wishlistCount > 0 ? 'text-[#e0531f] fill-[#e0531f]' : 'text-neutral-700'
                }`}
              />
              <span
                data-testid="wishlist-badge"
                className="tabular-nums text-[11px] font-bold text-[#111111]"
              >
                {wishlistCount}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              aria-label={`Open shopping bag (${cartCount} items)`}
              className="relative flex items-center gap-1.5 sm:gap-2 bg-[#111111] hover:bg-[#e0531f] text-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="hidden sm:inline">Bag</span>
              <span
                data-testid="cart-badge"
                className="tabular-nums min-w-[1.25rem] h-5 px-1 rounded bg-white/15 text-white text-[11px] font-bold flex items-center justify-center"
              >
                {cartCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle mobile navigation"
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-1.5 sm:p-2 rounded bg-neutral-100 border border-neutral-200 text-[#111111] shrink-0"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-white px-4 py-4 space-y-3">
            <div className="flex items-center bg-neutral-100 border border-neutral-200 rounded px-3 py-2">
              <Search className="w-4 h-4 text-neutral-500 mr-2 shrink-0" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search jerseys, hoodies, shorts..."
                className="bg-transparent text-sm text-[#111111] placeholder:text-neutral-500 focus:outline-none w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => handleLinkClick('shop')}
                className="text-left px-3 py-2.5 rounded bg-neutral-50 border border-neutral-200 text-[#111111]"
              >
                Shop Drop
              </button>
              <button
                type="button"
                onClick={() => handleLinkClick('collections')}
                className="text-left px-3 py-2.5 rounded bg-neutral-50 border border-neutral-200 text-[#111111]"
              >
                Collections
              </button>
              <button
                type="button"
                onClick={() => handleLinkClick('the-court')}
                className="text-left px-3 py-2.5 rounded bg-neutral-50 border border-neutral-200 text-[#111111]"
              >
                The Court
              </button>
              <button
                type="button"
                onClick={() => handleLinkClick('our-circle')}
                className="text-left px-3 py-2.5 rounded bg-neutral-50 border border-neutral-200 text-[#111111]"
              >
                Our Circle
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenTrackOrder();
                }}
                className="col-span-2 text-left px-3 py-2.5 rounded bg-[#111111] text-white"
              >
                Track Order
              </button>
            </div>
          </div>
        )}
      </header>
    </>
  );
};
