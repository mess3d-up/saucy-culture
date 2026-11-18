import { useEffect, useMemo, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { CartCheckoutDrawer } from './components/CartCheckoutDrawer';
import { CourtAndCircleSection } from './components/CourtAndCircleSection';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HeroSection } from './components/HeroSection';
import { LeadNotificationSystem } from './components/LeadNotificationSystem';
import { Navbar } from './components/Navbar';
import { PolicyModal, type PolicyTopic } from './components/PolicyModal';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { TrackOrderModal } from './components/TrackOrderModal';
import { WishlistRestockModal } from './components/WishlistRestockModal';
import { DEFAULT_STORE_SETTINGS, INITIAL_PRODUCTS, MASCOT_GORILLA_IMG } from './data/catalog';
import { fetchProducts, fetchStoreSettings } from './lib/api';
import { ensureServiceWorkerRegistered } from './lib/pushClient';
import {
  APPAREL_CATEGORIES,
  type ApparelCategory,
  type ApparelSize,
  type CartItem,
  type Product,
  type StoreSettings,
  type WishlistItem,
} from './types/store';
import { getSizeStock } from './utils/commerce';

const CART_STORAGE_KEY = 'saucy_culture_bag_v1';
const WISHLIST_STORAGE_KEY = 'saucy_culture_wishlist_v1';

function loadSavedCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadSavedWishlist(): WishlistItem[] {
  try {
    const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function StorefrontApp() {
  const [viewMode, setViewMode] = useState<'store' | 'admin'>(() =>
    window.location.pathname.startsWith('/admin') ? 'admin' : 'store'
  );

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'All' | ApparelCategory>('All');
  const [activeCollection, setActiveCollection] = useState<string>('All Drops');

  const [cartItems, setCartItems] = useState<CartItem[]>(loadSavedCart);
  const [wishlist, setWishlist] = useState<WishlistItem[]>(loadSavedWishlist);
  const [promoCode, setPromoCode] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [wishlistFocusItem, setWishlistFocusItem] = useState<{
    product: Product;
    size: ApparelSize;
  } | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [trackOrderPrefill, setTrackOrderPrefill] = useState('');
  const [trackTokenPrefill, setTrackTokenPrefill] = useState('');
  const [policyTopic, setPolicyTopic] = useState<PolicyTopic>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('track');
    const trackKey = params.get('key');
    if (trackId) {
      setTrackOrderPrefill(trackId.toUpperCase());
      if (trackKey) setTrackTokenPrefill(trackKey.toUpperCase());
      setTrackModalOpen(true);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setViewMode(window.location.pathname.startsWith('/admin') ? 'admin' : 'store');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshStorefront = async () => {
    try {
      const [prods, cfg] = await Promise.all([fetchProducts(), fetchStoreSettings()]);
      setProducts(prods);
      setSettings(cfg);
    } catch {
      // Keep existing state if temporary network error
    }
  };

  useEffect(() => {
    void refreshStorefront();
    void ensureServiceWorkerRegistered();
    const interval = window.setInterval(() => {
      void refreshStorefront();
    }, 30000);
    const onFocus = () => {
      void refreshStorefront();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch {
      // Storage unavailable
    }
  }, [cartItems]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
    } catch {
      // Storage unavailable
    }
  }, [wishlist]);

  const navigateMode = (mode: 'store' | 'admin') => {
    setViewMode(mode);
    const targetPath = mode === 'admin' ? '/admin' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (sectionId: string) => {
    if (viewMode !== 'store') {
      navigateMode('store');
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  const activeProducts = useMemo(() => products.filter((p) => p.active), [products]);

  const collectionNames = useMemo(() => {
    const unique = Array.from(new Set(activeProducts.map((p) => p.collection)));
    return ['All Drops', ...unique];
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeProducts.filter((p) => {
      if (activeCategory !== 'All' && p.category !== activeCategory) return false;
      if (activeCollection !== 'All Drops' && p.collection !== activeCollection) return false;
      if (q) {
        const hay = `${p.name} ${p.category} ${p.collection} ${p.spec}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeProducts, activeCategory, activeCollection, searchQuery]);

  const handleAddToCart = (product: Product, size: ApparelSize) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id && i.size === size);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: Math.min(10, next[idx].qty + 1) };
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          image: product.image,
          size,
          qty: 1,
          priceINR: product.priceINR,
        },
      ];
    });
  };

  const handleUpdateCartQty = (productId: string, size: ApparelSize, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.productId === productId && item.size === size
            ? { ...item, qty: Math.min(10, item.qty + delta) }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const handleRemoveCartItem = (productId: string, size: ApparelSize) => {
    setCartItems((prev) =>
      prev.filter((item) => !(item.productId === productId && item.size === size))
    );
  };

  const upsertWishlistItem = (product: Product, size: ApparelSize) => {
    const isOos = getSizeStock(product, size) <= 0;
    setWishlist((prev) => {
      if (prev.some((w) => w.productId === product.id && w.size === size)) {
        return prev;
      }
      return [
        {
          productId: product.id,
          name: product.name,
          image: product.image,
          size,
          priceINR: product.priceINR,
          addedAt: Date.now(),
          wasOutOfStock: isOos,
        },
        ...prev,
      ];
    });
  };

  const handleToggleWishlist = (product: Product, size: ApparelSize) => {
    const exists = wishlist.some((w) => w.productId === product.id);
    if (exists) {
      setWishlist((prev) => prev.filter((w) => w.productId !== product.id));
    } else {
      upsertWishlistItem(product, size);
    }
  };

  const handleWishlistOutOfStock = (product: Product, size: ApparelSize) => {
    upsertWishlistItem(product, size);
    setWishlistFocusItem({ product, size });
    setWishlistOpen(true);
  };

  const handleRemoveWishlistItem = (productId: string, size: ApparelSize) => {
    setWishlist((prev) => prev.filter((w) => !(w.productId === productId && w.size === size)));
  };

  const totalBagCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.qty, 0),
    [cartItems]
  );

  if (viewMode === 'admin') {
    return (
      <AdminDashboard
        products={products}
        settings={settings}
        onCatalogOrSettingsChanged={() => void refreshStorefront()}
        onExitAdmin={() => {
          void refreshStorefront();
          navigateMode('store');
        }}
      />
    );
  }

  if (settings.maintenanceMode) {
    return (
      <div className="min-h-screen bg-[#0c0d10] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full space-y-6">
          <img
            src={MASCOT_GORILLA_IMG}
            alt="Saucy Culture"
            referrerPolicy="no-referrer"
            className="w-20 h-20 mx-auto rounded-xl object-cover border-2 border-[#e0531f]"
          />
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#e0531f]">
              Saucy Culture India
            </p>
            <h1 className="font-display text-5xl uppercase tracking-wide">
              NEXT DROP LOADING
            </h1>
            <p className="text-sm text-neutral-300 leading-relaxed">
              We&apos;re locking in fresh inventory right now. Existing orders remain trackable
              below.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setTrackOrderPrefill('');
                setTrackTokenPrefill('');
                setTrackModalOpen(true);
              }}
              className="px-5 py-2.5 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Track Existing Order
            </button>
            <button
              type="button"
              onClick={() => navigateMode('admin')}
              className="px-5 py-2.5 rounded bg-neutral-900 border border-neutral-700 hover:border-white text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Admin Console
            </button>
          </div>
        </div>
        <TrackOrderModal
          open={trackModalOpen}
          initialOrderNumber={trackOrderPrefill}
          initialTrackingToken={trackTokenPrefill}
          onClose={() => setTrackModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-white text-[#111111] flex flex-col">
      <Navbar
        announcementText={settings.announcementText}
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          if (val.trim()) {
            document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }}
        cartCount={totalBagCount}
        wishlistCount={wishlist.length}
        onOpenCart={() => setCartOpen(true)}
        onOpenWishlist={() => {
          setWishlistFocusItem(null);
          setWishlistOpen(true);
        }}
        onOpenTrackOrder={() => {
          setTrackOrderPrefill('');
          setTrackTokenPrefill('');
          setTrackModalOpen(true);
        }}
        onNavigateSection={scrollToSection}
      />

      <main className="flex-1">
        <HeroSection
          heroTitle={settings.heroTitle}
          heroSubtitle={settings.heroSubtitle}
          onShopDrop={() => scrollToSection('shop')}
          onExploreCourt={() => scrollToSection('the-court')}
        />

        {/* SHOP & COLLECTIONS CATALOG — Pure minimal white studio gallery matching reference */}
        <section id="shop" className="py-14 sm:py-18 bg-white">
          <div id="collections" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-neutral-200 pb-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#e0531f]">
                  Saucy Culture · Drop Catalogue
                </p>
                <h2 className="font-display text-4xl sm:text-5xl uppercase text-[#111111] mt-1">
                  SHOP NEW ARRIVALS
                </h2>
              </div>

              {/* Filter Controls: Category + Collection */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div
                  className="flex flex-wrap items-center gap-1 p-1 bg-neutral-100 border border-neutral-200 rounded-lg"
                  role="tablist"
                  aria-label="Filter by apparel category"
                >
                  {(['All', ...APPAREL_CATEGORIES] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={activeCategory === cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-colors whitespace-nowrap cursor-pointer ${
                        activeCategory === cat
                          ? 'bg-[#111111] text-white'
                          : 'text-neutral-600 hover:text-[#111111]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <label htmlFor="collection-select" className="sr-only">
                  Filter by collection
                </label>
                <select
                  id="collection-select"
                  value={activeCollection}
                  onChange={(e) => setActiveCollection(e.target.value)}
                  className="px-3.5 py-2 rounded-lg bg-white border border-neutral-300 text-xs font-bold uppercase tracking-wider text-[#111111] focus:border-[#111111] focus:outline-none cursor-pointer"
                >
                  {collectionNames.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-12 text-center space-y-3">
                <p className="font-display text-2xl uppercase text-[#111111]">
                  No Garments Matched
                </p>
                <p className="text-sm text-neutral-600">
                  Try clearing your search or switching back to All Drops.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveCategory('All');
                    setActiveCollection('All Drops');
                  }}
                  className="px-5 py-2 rounded bg-[#111111] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isWishlisted={wishlist.some((w) => w.productId === product.id)}
                    onSelectProduct={setSelectedProduct}
                    onAddToCart={handleAddToCart}
                    onToggleWishlist={handleToggleWishlist}
                    onWishlistOutOfStock={handleWishlistOutOfStock}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <CourtAndCircleSection
          vipPromoCode={settings.vipPromoCode}
          vipDiscountPercent={settings.vipDiscountPercent}
          onApplyVipCode={(code) => setPromoCode(code)}
        />
      </main>

      {/* Clean Grounded Storefront Footer */}
      <footer className="bg-[#111111] text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <img
                src={MASCOT_GORILLA_IMG}
                alt="Saucy Culture"
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded object-cover border border-neutral-700"
              />
              <span className="font-graffiti text-xl text-white">SAUCY CULTURE</span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed max-w-sm">
              India-born basketball × streetwear label. Crafted in New Delhi with heavyweight cotton
              fleece, pro-mesh knits, and fearless court graphics.
            </p>
            <p className="text-xs text-neutral-400">
              Support: {settings.supportEmail} · WhatsApp +{settings.supportWhatsapp}
            </p>
          </div>

          <div className="md:col-span-4 grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <p className="font-bold uppercase tracking-wider text-white">Explore</p>
              <button
                type="button"
                onClick={() => scrollToSection('shop')}
                className="block text-neutral-400 hover:text-[#e0531f] cursor-pointer"
              >
                Shop All Drop
              </button>
              <button
                type="button"
                onClick={() => scrollToSection('the-court')}
                className="block text-neutral-400 hover:text-[#e0531f] cursor-pointer"
              >
                Size Chart &amp; Lookbook
              </button>
              <button
                type="button"
                onClick={() => {
                  setTrackOrderPrefill('');
                  setTrackModalOpen(true);
                }}
                className="block text-neutral-400 hover:text-[#e0531f] cursor-pointer"
              >
                Track Order
              </button>
            </div>

            <div className="space-y-2">
              <p className="font-bold uppercase tracking-wider text-white">Policies</p>
              <button
                type="button"
                onClick={() => setPolicyTopic('shipping')}
                className="block text-neutral-400 hover:text-[#e0531f] cursor-pointer"
              >
                Pan-India Shipping
              </button>
              <button
                type="button"
                onClick={() => setPolicyTopic('returns')}
                className="block text-neutral-400 hover:text-[#e0531f] cursor-pointer"
              >
                7-Day Exchange
              </button>
              <button
                type="button"
                onClick={() => setPolicyTopic('privacy')}
                className="block text-neutral-400 hover:text-[#e0531f] cursor-pointer"
              >
                Privacy &amp; Terms
              </button>
            </div>
          </div>

          <div className="md:col-span-3 md:text-right space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-white">
              Store Operations
            </p>
            <button
              type="button"
              onClick={() => navigateMode('admin')}
              className="inline-flex items-center justify-center px-4 py-2 rounded bg-neutral-900 border border-neutral-700 hover:border-[#e0531f] text-xs font-bold uppercase tracking-wider text-white transition-colors cursor-pointer"
            >
              Admin Console
            </button>
            <p className="text-[11px] text-neutral-500">
              © {new Date().getFullYear()} Saucy Culture India. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <ProductDetailModal
        product={selectedProduct}
        freeShippingThresholdINR={settings.freeShippingThresholdINR}
        isWishlisted={Boolean(
          selectedProduct && wishlist.some((w) => w.productId === selectedProduct.id)
        )}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onToggleWishlist={handleToggleWishlist}
        onWishlistOutOfStock={handleWishlistOutOfStock}
        onJumpToSizeChart={() => scrollToSection('size-chart')}
      />

      <WishlistRestockModal
        open={wishlistOpen}
        wishlist={wishlist}
        catalog={activeProducts}
        focusItem={wishlistFocusItem}
        vipPromoCode={settings.vipPromoCode}
        vipDiscountPercent={settings.vipDiscountPercent}
        onClose={() => setWishlistOpen(false)}
        onRemoveWishlistItem={handleRemoveWishlistItem}
        onMoveToCart={handleAddToCart}
        onApplyVipCode={(code) => setPromoCode(code)}
        onOpenCart={() => setCartOpen(true)}
      />

      <LeadNotificationSystem
        cartItems={cartItems}
        catalog={activeProducts}
        wishlist={wishlist}
        settings={settings}
        externalOpen={leadModalOpen}
        onCloseExternal={() => setLeadModalOpen(false)}
        onApplyVipCode={(code) => setPromoCode(code)}
        onOpenCart={() => setCartOpen(true)}
        onAddToCart={handleAddToCart}
      />

      <CartCheckoutDrawer
        open={cartOpen}
        items={cartItems}
        catalog={activeProducts}
        settings={settings}
        promoCode={promoCode}
        onPromoCodeChange={setPromoCode}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={() => setCartItems([])}
        onClose={() => setCartOpen(false)}
        onTrackOrder={(orderNum, token) => {
          setTrackOrderPrefill(orderNum);
          setTrackTokenPrefill(token ?? '');
          setTrackModalOpen(true);
        }}
        onOrderPlaced={() => void refreshStorefront()}
        onOpenLeadAlerts={() => setLeadModalOpen(true)}
      />

      <TrackOrderModal
        open={trackModalOpen}
        initialOrderNumber={trackOrderPrefill}
        initialTrackingToken={trackTokenPrefill}
        onClose={() => setTrackModalOpen(false)}
      />

      <PolicyModal topic={policyTopic} settings={settings} onClose={() => setPolicyTopic(null)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StorefrontApp />
    </ErrorBoundary>
  );
}
