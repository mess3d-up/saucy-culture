import React, { useState } from 'react';
import { BellRing, CheckCircle2, Heart, ShoppingBag, Trash2, X } from 'lucide-react';
import { saveRestockAlert } from '../lib/api';
import { subscribeBrowserBackgroundPush } from '../lib/pushClient';
import type { ApparelSize, Product, WishlistItem } from '../types/store';
import { formatINR, getSizeStock, validateLeadContact } from '../utils/commerce';

interface WishlistRestockModalProps {
  open: boolean;
  wishlist: WishlistItem[];
  catalog: Product[];
  focusItem: { product: Product; size: ApparelSize } | null;
  vipPromoCode: string;
  vipDiscountPercent: number;
  onClose: () => void;
  onRemoveWishlistItem: (productId: string, size: ApparelSize) => void;
  onMoveToCart: (product: Product, size: ApparelSize) => void;
  onApplyVipCode: (code: string) => void;
  onOpenCart: () => void;
}

export const WishlistRestockModal: React.FC<WishlistRestockModalProps> = ({
  open,
  wishlist,
  catalog,
  focusItem,
  vipPromoCode,
  vipDiscountPercent,
  onClose,
  onRemoveWishlistItem,
  onMoveToCart,
  onApplyVipCode,
  onOpenCart,
}) => {
  const [contact, setContact] = useState('');
  const [enablePush, setEnablePush] = useState(
    () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [alertSavedFor, setAlertSavedFor] = useState<string | null>(null);
  const [activeAlertTarget, setActiveAlertTarget] = useState<{
    product: Product;
    size: ApparelSize;
  } | null>(focusItem);

  React.useEffect(() => {
    setActiveAlertTarget(focusItem);
    setErrorMsg('');
    setAlertSavedFor(null);
  }, [focusItem, open]);

  if (!open) return null;

  const catalogById = new Map(catalog.map((p) => [p.id, p]));

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
    } else {
      setEnablePush(false);
    }
  };

  const handleSubmitRestockAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAlertTarget) return;
    setErrorMsg('');

    const validated = validateLeadContact(contact);
    if (!validated.valid) {
      setErrorMsg(validated.error);
      return;
    }

    setSubmitting(true);
    try {
      await saveRestockAlert({
        productId: activeAlertTarget.product.id,
        productName: activeAlertTarget.product.name,
        size: activeAlertTarget.size,
        contact: validated.normalized,
        pushEnabled: enablePush,
      });

      if (enablePush) {
        await subscribeBrowserBackgroundPush({
          contact: validated.normalized,
          topic: 'RESTOCK',
          productId: activeAlertTarget.product.id,
          size: activeAlertTarget.size,
        });
      }

      onApplyVipCode(vipPromoCode);
      setAlertSavedFor(`${activeAlertTarget.product.name} (${activeAlertTarget.size})`);

      if (enablePush && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`Saucy Culture Restock Alert Locked`, {
          body: `We'll ping you the second ${activeAlertTarget.product.name} (${activeAlertTarget.size}) drops back + ${vipDiscountPercent}% OFF with ${vipPromoCode}.`,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save alert right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Wishlist and back-in-stock alerts"
    >
      <div className="bg-white border border-neutral-200 rounded-xl max-w-xl w-full overflow-hidden shadow-2xl my-auto text-neutral-900">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-[#e0531f] fill-[#e0531f]" />
            <h2 className="font-display text-2xl uppercase tracking-wide text-neutral-900">
              Wishlist &amp; Restock Alerts
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wishlist"
            className="p-1.5 rounded hover:bg-neutral-200 text-neutral-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Active Back-in-Stock Lead Form */}
          {activeAlertTarget && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 sm:p-5 space-y-3.5">
              {alertSavedFor ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Restock Alert Confirmed
                  </div>
                  <p className="text-sm text-neutral-800">
                    You&apos;re first in line for <strong>{alertSavedFor}</strong>. Plus we
                    unlocked <strong>{vipPromoCode}</strong> ({vipDiscountPercent}% OFF) for your
                    next drop!
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <img
                      src={activeAlertTarget.product.image}
                      alt={activeAlertTarget.product.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded object-cover bg-white border border-neutral-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#e0531f]">
                        Size {activeAlertTarget.size} Sold Out · Notify Me + {vipDiscountPercent}% Off
                      </p>
                      <h3 className="font-bold text-sm text-neutral-900 truncate">
                        {activeAlertTarget.product.name}
                      </h3>
                      <p className="text-xs text-neutral-600">
                        Drop your WhatsApp or email — we&apos;ll hit you up the second Size{' '}
                        {activeAlertTarget.size} restocks with an instant {vipPromoCode}{' '}
                        {vipDiscountPercent}% OFF pass.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmitRestockAlert} className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <label htmlFor="restock-contact" className="sr-only">
                        WhatsApp number or email
                      </label>
                      <input
                        id="restock-contact"
                        type="text"
                        required
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        placeholder="10-digit WhatsApp or email"
                        className="flex-1 px-3.5 py-2.5 rounded bg-white border border-neutral-300 focus:border-[#e0531f] focus:outline-none text-sm text-neutral-900"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-4 py-2.5 rounded bg-[#111111] hover:bg-[#e0531f] text-white text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        {submitting ? 'Saving...' : 'Notify Me'}
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enablePush}
                        onChange={(e) => void handleTogglePush(e.target.checked)}
                        className="accent-[#e0531f]"
                      />
                      Also send instant browser push notification when restocked
                    </label>

                    {errorMsg && <p className="text-xs text-red-600 font-medium">{errorMsg}</p>}
                  </form>
                </>
              )}
            </div>
          )}

          {/* Saved Wishlist Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Saved Items ({wishlist.length})
              </p>
            </div>

            {wishlist.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-neutral-200 rounded-lg space-y-2">
                <p className="text-sm font-semibold text-neutral-800">Your wishlist is empty</p>
                <p className="text-xs text-neutral-500">
                  Tap the heart on any garment or wishlist sold-out sizes for restock alerts.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {wishlist.map((item) => {
                  const liveProd = catalogById.get(item.productId);
                  const currentStock = liveProd ? getSizeStock(liveProd, item.size) : 0;
                  const inStock = Boolean(liveProd?.active && currentStock > 0);
                  return (
                    <li
                      key={`${item.productId}-${item.size}`}
                      className="flex items-center gap-3.5 p-3 rounded-lg border border-neutral-200 bg-white"
                    >
                      <img
                        src={liveProd?.image ?? item.image}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded object-cover bg-neutral-100 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-neutral-900 truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-neutral-600 tabular-nums">
                          Size {item.size} · {formatINR(liveProd?.priceINR ?? item.priceINR)} ·{' '}
                          <span className={inStock ? 'text-emerald-700 font-semibold' : 'text-[#e0531f] font-semibold'}>
                            {inStock ? `${currentStock} back in stock` : 'Sold Out'}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {inStock && liveProd ? (
                          <button
                            type="button"
                            onClick={() => {
                              onMoveToCart(liveProd, item.size);
                              onRemoveWishlistItem(item.productId, item.size);
                              onClose();
                              onOpenCart();
                            }}
                            className="px-3 py-1.5 rounded bg-[#111111] hover:bg-[#e0531f] text-white text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <ShoppingBag className="w-3 h-3" />
                            Add
                          </button>
                        ) : liveProd ? (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAlertTarget({ product: liveProd, size: item.size });
                              setAlertSavedFor(null);
                            }}
                            className="px-2.5 py-1.5 rounded border border-neutral-300 hover:border-[#e0531f] text-neutral-800 text-[11px] font-bold uppercase tracking-wider cursor-pointer"
                          >
                            Alert Me
                          </button>
                        ) : null}

                        <button
                          type="button"
                          aria-label={`Remove ${item.name} ${item.size} from wishlist`}
                          onClick={() => onRemoveWishlistItem(item.productId, item.size)}
                          className="p-1.5 rounded text-neutral-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
