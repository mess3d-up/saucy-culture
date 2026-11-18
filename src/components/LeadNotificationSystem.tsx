import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Flame, ShoppingBag, Sparkles, X } from 'lucide-react';
import { MASCOT_GORILLA_IMG } from '../data/catalog';
import { saveCartLead } from '../lib/api';
import { subscribeBrowserBackgroundPush } from '../lib/pushClient';
import type { CartItem, Product, StoreSettings, WishlistItem } from '../types/store';
import {
  buildAbandonedCartPitch,
  buildRestockPitch,
  findRestockedWishlistItems,
  formatINR,
  validateLeadContact,
} from '../utils/commerce';

const SESSION_DISMISS_KEY = 'saucy_exit_promo_shown_v1';
const CART_TIMESTAMP_KEY = 'saucy_cart_updated_at_v1';

interface LeadNotificationSystemProps {
  cartItems: CartItem[];
  catalog: Product[];
  wishlist: WishlistItem[];
  settings: StoreSettings;
  externalOpen: boolean;
  onCloseExternal: () => void;
  onApplyVipCode: (code: string) => void;
  onOpenCart: () => void;
  onAddToCart: (product: Product, size: WishlistItem['size']) => void;
}

export const LeadNotificationSystem: React.FC<LeadNotificationSystemProps> = ({
  cartItems,
  catalog,
  wishlist,
  settings,
  externalOpen,
  onCloseExternal,
  onApplyVipCode,
  onOpenCart,
  onAddToCart,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [contactInput, setContactInput] = useState('');
  const [enablePush, setEnablePush] = useState(
    () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [leadSuccess, setLeadSuccess] = useState(false);

  const [restockToast, setRestockToast] = useState<WishlistItem | null>(null);
  const notifiedRestocksRef = useRef<Set<string>>(new Set());
  const mountedAtRef = useRef<number>(Date.now());
  const hiddenAtRef = useRef<number | null>(null);
  const leaveNotificationTimerRef = useRef<number | null>(null);

  const isVisibleModal = modalOpen || externalOpen;

  // Track cart activity timestamp so returning visitors with an abandoned bag see recovery offer
  useEffect(() => {
    try {
      if (cartItems.length > 0) {
        if (!window.localStorage.getItem(CART_TIMESTAMP_KEY)) {
          window.localStorage.setItem(CART_TIMESTAMP_KEY, String(Date.now()));
        }
      } else {
        window.localStorage.removeItem(CART_TIMESTAMP_KEY);
      }
    } catch {
      // Storage blocked
    }
  }, [cartItems.length]);

  // Returning visitor with abandoned cart saved from > 90s ago
  useEffect(() => {
    if (cartItems.length === 0) return;
    try {
      if (window.sessionStorage.getItem(SESSION_DISMISS_KEY)) return;
      const savedTs = Number(window.localStorage.getItem(CART_TIMESTAMP_KEY) || '0');
      if (savedTs > 0 && Date.now() - savedTs > 90_000) {
        const timer = window.setTimeout(() => {
          window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
          setModalOpen(true);
        }, 1200);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Storage blocked
    }
  }, [cartItems.length]);

  // Desktop exit-intent & tab-leave Web Notification trigger (only when bag has items)
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY > 8) return;
      if (cartItems.length === 0) return;
      if (Date.now() - mountedAtRef.current < 8000) return;
      try {
        if (window.sessionStorage.getItem(SESSION_DISMISS_KEY)) return;
        window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
      } catch {
        // Ignore storage error
      }
      setModalOpen(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        if (
          cartItems.length > 0 &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          leaveNotificationTimerRef.current = window.setTimeout(() => {
            const pitch = buildAbandonedCartPitch({
              items: cartItems,
              promoCode: settings.vipPromoCode,
              discountPercent: settings.vipDiscountPercent,
            });
            try {
              new Notification(pitch.title, {
                body: pitch.body,
                icon: MASCOT_GORILLA_IMG,
              });
            } catch {
              // Browser notification blocked
            }
          }, 3500);
        }
      } else if (document.visibilityState === 'visible') {
        if (leaveNotificationTimerRef.current !== null) {
          window.clearTimeout(leaveNotificationTimerRef.current);
          leaveNotificationTimerRef.current = null;
        }
        const leftDuration = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
        hiddenAtRef.current = null;
        if (leftDuration >= 4000 && cartItems.length > 0) {
          try {
            if (!window.sessionStorage.getItem(SESSION_DISMISS_KEY)) {
              window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
              setModalOpen(true);
            }
          } catch {
            setModalOpen(true);
          }
        }
      }
    };

    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (leaveNotificationTimerRef.current !== null) {
        window.clearTimeout(leaveNotificationTimerRef.current);
      }
    };
  }, [cartItems, settings.vipPromoCode, settings.vipDiscountPercent]);

  // Live Firestore restock alert detection for wishlisted sold-out items
  useEffect(() => {
    const restocked = findRestockedWishlistItems(wishlist, catalog);
    const firstFresh = restocked.find(
      (item) => !notifiedRestocksRef.current.has(`${item.productId}-${item.size}`)
    );
    if (!firstFresh) return;

    notifiedRestocksRef.current.add(`${firstFresh.productId}-${firstFresh.size}`);
    setRestockToast(firstFresh);

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      const pitch = buildRestockPitch({
        productName: firstFresh.name,
        size: firstFresh.size,
        promoCode: settings.vipPromoCode,
        discountPercent: settings.vipDiscountPercent,
      });
      try {
        new Notification(pitch.title, { body: pitch.body, icon: MASCOT_GORILLA_IMG });
      } catch {
        // Ignore
      }
    }
  }, [wishlist, catalog, settings.vipPromoCode, settings.vipDiscountPercent]);

  const closeModal = () => {
    setModalOpen(false);
    setErrorMsg('');
    onCloseExternal();
  };

  const handleTogglePush = async (checked: boolean) => {
    if (!checked) {
      setEnablePush(false);
      return;
    }
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setEnablePush(perm === 'granted');
      } catch {
        setEnablePush(false);
      }
    }
  };

  const handleClaimOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const validated = validateLeadContact(contactInput);
    if (!validated.valid) {
      setErrorMsg(validated.error);
      return;
    }

    const totalINR = cartItems.reduce((sum, i) => sum + i.priceINR * i.qty, 0);
    setSubmitting(true);
    try {
      let pushGranted = enablePush;
      if (
        enablePush &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'default'
      ) {
        const perm = await Notification.requestPermission();
        pushGranted = perm === 'granted';
      }

      await saveCartLead({
        contact: validated.normalized,
        channel: validated.channel,
        itemsSummary: cartItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          size: i.size,
          qty: i.qty,
          priceINR: i.priceINR,
        })),
        cartTotalINR: Math.max(1, totalINR),
        promoOffered: settings.vipPromoCode,
        pushEnabled: pushGranted,
      });

      if (pushGranted) {
        await subscribeBrowserBackgroundPush({
          contact: validated.normalized,
          topic: 'CART_ABANDON',
        });
      }

      onApplyVipCode(settings.vipPromoCode);
      setLeadSuccess(true);

      if (
        pushGranted &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        new Notification(`${settings.vipDiscountPercent}% OFF UNLOCKED — ${settings.vipPromoCode}`, {
          body: `Your bag is locked in with ${settings.vipPromoCode}. Tap back to finish checkout before sizes sell out!`,
          icon: MASCOT_GORILLA_IMG,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save alert right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const leadItem = cartItems[0];
  const bagTotalINR = cartItems.reduce((sum, i) => sum + i.priceINR * i.qty, 0);
  const pitch = buildAbandonedCartPitch({
    items: cartItems,
    promoCode: settings.vipPromoCode,
    discountPercent: settings.vipDiscountPercent,
  });

  return (
    <>
      {/* Live Restock Toast when a wishlisted sold-out product/size returns to stock */}
      {restockToast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 max-w-sm bg-[#111111] text-white border border-neutral-800 rounded-xl shadow-2xl p-4 space-y-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-[#e0531f] text-xs font-bold uppercase tracking-wider">
              <Flame className="w-4 h-4 shrink-0" />
              Back In Stock Alert
            </div>
            <button
              type="button"
              onClick={() => setRestockToast(null)}
              aria-label="Dismiss restock alert"
              className="text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-neutral-200 leading-relaxed">
            <strong>{restockToast.name}</strong> (Size <strong>{restockToast.size}</strong>) just
            restocked! Grab it + {settings.vipDiscountPercent}% OFF with{' '}
            <strong>{settings.vipPromoCode}</strong>.
          </p>
          <button
            type="button"
            onClick={() => {
              const prod = catalog.find((p) => p.id === restockToast.productId);
              if (prod) {
                onAddToCart(prod, restockToast.size);
                onApplyVipCode(settings.vipPromoCode);
                setRestockToast(null);
                onOpenCart();
              }
            }}
            className="w-full py-2 px-3 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Grab Size {restockToast.size} Now
          </button>
        </div>
      )}

      {/* High-Converting Abandoned Cart / 10% Off Lead Modal */}
      {isVisibleModal && cartItems.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Don't leave your drop behind — 10% off offer"
        >
          <div className="bg-white border border-neutral-200 rounded-xl max-w-md w-full overflow-hidden shadow-2xl text-neutral-900">
            <div className="bg-[#111111] text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#e0531f] text-xs font-bold uppercase tracking-wider">
                <Flame className="w-4 h-4" />
                Wait · Lock Your {settings.vipDiscountPercent}% Off
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close offer modal"
                className="p-1 rounded hover:bg-neutral-800 text-neutral-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {leadSuccess ? (
                <div className="space-y-4 text-center py-2">
                  <div className="w-12 h-12 mx-auto rounded-full bg-orange-50 flex items-center justify-center text-[#e0531f]">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-display text-3xl uppercase text-neutral-900">
                      {settings.vipPromoCode} UNLOCKED!
                    </h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">
                      Instant <strong>{settings.vipDiscountPercent}% OFF</strong> is now applied to
                      your bag, plus you&apos;ll get instant alerts on restocks &amp; drops.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      closeModal();
                      onOpenCart();
                    }}
                    className="w-full py-3 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Checkout With {settings.vipDiscountPercent}% Off Now
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <h3 className="font-display text-3xl uppercase leading-none text-neutral-900">
                      {pitch.title}
                    </h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">{pitch.body}</p>
                  </div>

                  {leadItem && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                      <img
                        src={leadItem.image}
                        alt={leadItem.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded object-cover bg-white shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-neutral-900 truncate">
                          {leadItem.name} ({leadItem.size})
                          {cartItems.length > 1 ? ` + ${cartItems.length - 1} more` : ''}
                        </p>
                        <p className="text-xs text-neutral-500 tabular-nums">
                          Bag Total: {formatINR(bagTotalINR)} · Save{' '}
                          <strong className="text-[#e0531f]">
                            {formatINR(Math.round((bagTotalINR * settings.vipDiscountPercent) / 100))}
                          </strong>
                        </p>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleClaimOffer} className="space-y-3">
                    <div>
                      <label
                        htmlFor="lead-recovery-contact"
                        className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1"
                      >
                        WhatsApp or Email for {settings.vipDiscountPercent}% Off + Drop Alerts
                      </label>
                      <input
                        id="lead-recovery-contact"
                        type="text"
                        required
                        value={contactInput}
                        onChange={(e) => setContactInput(e.target.value)}
                        placeholder="9876543210 or you@email.com"
                        className="w-full px-3.5 py-2.5 rounded bg-white border border-neutral-300 focus:border-[#e0531f] focus:outline-none text-sm text-neutral-900"
                      />
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePush}
                        onChange={(e) => void handleTogglePush(e.target.checked)}
                        className="accent-[#e0531f]"
                      />
                      Send me instant browser push alerts if I leave or stock drops
                    </label>

                    {errorMsg && <p className="text-xs text-red-600 font-medium">{errorMsg}</p>}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-3 rounded bg-[#111111] hover:bg-[#e0531f] text-white text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <BellRing className="w-4 h-4" />
                      {submitting
                        ? 'Unlocking...'
                        : `Claim ${settings.vipDiscountPercent}% Off (${settings.vipPromoCode})`}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
