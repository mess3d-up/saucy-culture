import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  BellRing,
  CheckCircle2,
  Copy,
  ExternalLink,
  Minus,
  Plus,
  ShoppingBag,
  Smartphone,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { placeCustomerOrder } from '../lib/api';
import type { ApparelSize, CartItem, PaymentMethod, Product, StoreSettings } from '../types/store';
import {
  buildUpiPaymentUri,
  calculateAuthoritativeTotals,
  formatINR,
  generateOrderNumber,
  validateCheckoutInput,
} from '../utils/commerce';

interface CartCheckoutDrawerProps {
  open: boolean;
  items: CartItem[];
  catalog: Product[];
  settings: StoreSettings;
  promoCode: string;
  onPromoCodeChange: (code: string) => void;
  onUpdateQty: (productId: string, size: ApparelSize, delta: number) => void;
  onRemoveItem: (productId: string, size: ApparelSize) => void;
  onClearCart: () => void;
  onClose: () => void;
  onTrackOrder: (orderNumber: string, trackingToken?: string) => void;
  onOrderPlaced?: () => void;
  onOpenLeadAlerts: () => void;
}

export const CartCheckoutDrawer: React.FC<CartCheckoutDrawerProps> = ({
  open,
  items,
  catalog,
  settings,
  promoCode,
  onPromoCodeChange,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onClose,
  onTrackOrder,
  onOrderPlaced,
  onOpenLeadAlerts,
}) => {
  const [step, setStep] = useState<'bag' | 'checkout' | 'confirmed'>('bag');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddr, setShippingAddr] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [upiRef, setUpiRef] = useState('');
  const [websiteTrap, setWebsiteTrap] = useState('');
  const [pendingOrderRef, setPendingOrderRef] = useState(() => generateOrderNumber());
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedTrackingKey, setCopiedTrackingKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmedReceipt, setConfirmedReceipt] = useState<{
    orderNumber: string;
    trackingToken: string;
    totalINR: number;
    paymentMethod: PaymentMethod;
  } | null>(null);

  const totals = useMemo(() => {
    if (items.length === 0) return null;
    try {
      return calculateAuthoritativeTotals(items, catalog, settings, promoCode);
    } catch {
      return null;
    }
  }, [items, catalog, settings, promoCode]);

  const upiUri = useMemo(() => {
    if (!totals) return '';
    return buildUpiPaymentUri({
      upiId: settings.upiId,
      merchantName: settings.upiMerchantName,
      amountINR: totals.totalINR,
      orderRef: pendingOrderRef,
    });
  }, [totals, settings.upiId, settings.upiMerchantName, pendingOrderRef]);

  if (!open) return null;

  const handleClose = () => {
    if (step === 'confirmed') {
      setStep('bag');
      setConfirmedReceipt(null);
    }
    setErrorMsg('');
    onClose();
  };

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(settings.upiId);
      setCopiedUpi(true);
      window.setTimeout(() => setCopiedUpi(false), 1500);
    } catch {
      // Clipboard blocked in restricted contexts
    }
  };

  const handleCopyTrackingKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedTrackingKey(true);
      window.setTimeout(() => setCopiedTrackingKey(false), 1500);
    } catch {
      // Clipboard blocked
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const validationError = validateCheckoutInput({
      customerName,
      customerPhone,
      shippingAddr,
      city,
      pincode,
      paymentMethod,
      upiRef,
    });
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    let authoritative;
    try {
      authoritative = calculateAuthoritativeTotals(items, catalog, settings, promoCode);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to verify bag totals.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await placeCustomerOrder({
        customerName,
        customerPhone,
        shippingAddr,
        city,
        pincode,
        items: authoritative.items,
        subtotalINR: authoritative.subtotalINR,
        shippingINR: authoritative.shippingINR,
        discountINR: authoritative.discountINR,
        promoCode: authoritative.appliedPromoCode,
        totalINR: authoritative.totalINR,
        paymentMethod,
        upiRef,
        website: websiteTrap,
      });

      setConfirmedReceipt({
        orderNumber: result.orderNumber,
        trackingToken: result.trackingToken,
        totalINR: result.totalINR,
        paymentMethod,
      });
      onClearCart();
      onOrderPlaced?.();
      setPendingOrderRef(generateOrderNumber());
      setUpiRef('');
      setStep('confirmed');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Order failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const remainingForFreeShipping = totals
    ? Math.max(0, settings.freeShippingThresholdINR - (totals.subtotalINR - totals.discountINR))
    : settings.freeShippingThresholdINR;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping bag and checkout"
    >
      <div className="w-full max-w-lg bg-white border-l border-neutral-200 h-full flex flex-col shadow-2xl text-[#111111]">
        {/* Drawer Header */}
        <div className="px-5 py-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#e0531f]" />
            <h2 className="font-display text-2xl uppercase text-[#111111] tracking-wide">
              {step === 'bag'
                ? 'Your Bag'
                : step === 'checkout'
                ? 'Checkout · India'
                : 'Order Placed'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close shopping bag"
            className="p-1.5 rounded hover:bg-neutral-200 text-neutral-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {step === 'confirmed' && confirmedReceipt ? (
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-3 text-emerald-700">
                <CheckCircle2 className="w-7 h-7 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">
                    Saucy Culture Dispatch Queue
                  </p>
                  <h3 className="font-display text-2xl text-[#111111]">
                    {confirmedReceipt.orderNumber}
                  </h3>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-lg p-4 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Order Total</span>
                  <span className="font-bold text-[#111111] tabular-nums">
                    {formatINR(confirmedReceipt.totalINR)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Payment</span>
                  <span className="font-semibold text-[#111111]">
                    {confirmedReceipt.paymentMethod === 'UPI_DIRECT'
                      ? 'Direct UPI (UTR Submitted for Verification)'
                      : 'Cash on Delivery (Stock Reserved)'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-100">
                  <span className="text-neutral-500">Tracking Key</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-[#111111]">
                      {confirmedReceipt.trackingToken}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyTrackingKey(confirmedReceipt.trackingToken)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-[11px] font-semibold text-[#111111] cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedTrackingKey ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-neutral-600 leading-relaxed">
                Save both your Order ID{' '}
                <strong className="text-[#111111]">{confirmedReceipt.orderNumber}</strong> and
                Tracking Key{' '}
                <strong className="text-[#111111]">{confirmedReceipt.trackingToken}</strong> to
                check live packing and courier updates anytime via Track Order.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const num = confirmedReceipt.orderNumber;
                    const key = confirmedReceipt.trackingToken;
                    handleClose();
                    onTrackOrder(num, key);
                  }}
                  className="flex-1 py-3 px-4 rounded bg-[#111111] hover:bg-[#e0531f] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Track This Order
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="py-3 px-4 rounded bg-white border border-neutral-300 text-neutral-800 text-xs font-bold uppercase tracking-wider hover:border-[#111111] cursor-pointer"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-neutral-500" />
              </div>
              <div>
                <p className="font-display text-2xl uppercase text-[#111111]">Your Bag Is Empty</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Pick your fit from the All-Star Drop to get started.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="px-6 py-2.5 rounded bg-[#111111] hover:bg-[#e0531f] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Browse Drop
              </button>
            </div>
          ) : step === 'bag' ? (
            <>
              {/* Free Shipping Progress */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3.5 text-xs">
                <div className="flex items-center gap-2 text-[#111111] font-semibold">
                  <Truck className="w-4 h-4 text-[#e0531f]" />
                  {remainingForFreeShipping === 0 ? (
                    <span>Free Pan-India Shipping Unlocked</span>
                  ) : (
                    <span>
                      Add {formatINR(remainingForFreeShipping)} more for free shipping across India
                    </span>
                  )}
                </div>
              </div>

              {/* Cart Items */}
              <ul className="space-y-3">
                {items.map((item) => (
                  <li
                    key={`${item.productId}-${item.size}`}
                    className="bg-white border border-neutral-200 rounded-lg p-3.5 flex gap-3.5 items-center"
                  >
                    <img
                      src={item.image}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-16 h-16 rounded object-cover bg-neutral-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-[#111111] truncate">{item.name}</p>
                      <p className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                        Size {item.size} · {formatINR(item.priceINR)}
                      </p>

                      <div className="mt-2 flex items-center gap-2">
                        <div className="inline-flex items-center border border-neutral-200 rounded bg-neutral-50">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${item.name} ${item.size}`}
                            onClick={() => onUpdateQty(item.productId, item.size, -1)}
                            className="p-1.5 text-neutral-700 hover:text-[#111111] cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2.5 text-xs font-bold tabular-nums">{item.qty}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${item.name} ${item.size}`}
                            onClick={() => onUpdateQty(item.productId, item.size, 1)}
                            className="p-1.5 text-neutral-700 hover:text-[#111111] cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          aria-label={`Remove ${item.name} ${item.size}`}
                          onClick={() => onRemoveItem(item.productId, item.size)}
                          className="p-1.5 text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Stepping Away Lead-Gen + Instant 10% Off Hook */}
              <div className="bg-orange-50/70 border border-[#e0531f]/35 rounded-lg p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#111111]">
                    Stepping away? Lock {settings.vipDiscountPercent}% OFF + Drop Alerts
                  </p>
                  <p className="text-[11px] text-neutral-600">
                    Reserve your bag &amp; get instant {settings.vipPromoCode} discount alerts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onOpenLeadAlerts();
                  }}
                  className="px-3 py-2 rounded bg-[#e0531f] hover:bg-[#c84617] text-white text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  Claim {settings.vipDiscountPercent}% Off
                </button>
              </div>

              {/* VIP Promo Input */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3.5 space-y-2">
                <label
                  htmlFor="promo-code-input"
                  className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600"
                >
                  Our Circle VIP Code
                </label>
                <div className="flex gap-2">
                  <input
                    id="promo-code-input"
                    type="text"
                    value={promoCode}
                    onChange={(e) => onPromoCodeChange(e.target.value.toUpperCase())}
                    placeholder={`Try ${settings.vipPromoCode}`}
                    className="flex-1 px-3 py-2 rounded bg-white border border-neutral-300 focus:border-[#111111] focus:outline-none text-xs text-[#111111] uppercase"
                  />
                </div>
                {totals?.appliedPromoCode && (
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    {totals.appliedPromoCode} applied ({settings.vipDiscountPercent}% off)
                  </p>
                )}
              </div>
            </>
          ) : (
            /* CHECKOUT FORM */
            <form id="checkout-form" onSubmit={handleSubmitOrder} className="space-y-4">
              <div className="sr-only" aria-hidden="true">
                <label htmlFor="chk-website-trap">Leave blank</label>
                <input
                  id="chk-website-trap"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={websiteTrap}
                  onChange={(e) => setWebsiteTrap(e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => setStep('bag')}
                className="text-xs font-bold uppercase tracking-wider text-[#e0531f] hover:underline cursor-pointer"
              >
                ← Back to Bag
              </button>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="chk-name"
                    className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="chk-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Aarav Sharma"
                    className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="chk-phone"
                      className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                    >
                      10-Digit Mobile
                    </label>
                    <input
                      id="chk-phone"
                      type="tel"
                      required
                      maxLength={10}
                      value={customerPhone}
                      onChange={(e) =>
                        setCustomerPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))
                      }
                      placeholder="9876543210"
                      className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111] tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="chk-pincode"
                      className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                    >
                      PIN Code
                    </label>
                    <input
                      id="chk-pincode"
                      type="text"
                      required
                      maxLength={6}
                      value={pincode}
                      onChange={(e) =>
                        setPincode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
                      }
                      placeholder="110016"
                      className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111] tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="chk-city"
                    className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                  >
                    City / State
                  </label>
                  <input
                    id="chk-city"
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="New Delhi"
                    className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="chk-address"
                    className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                  >
                    Delivery Address
                  </label>
                  <textarea
                    id="chk-address"
                    required
                    rows={2}
                    value={shippingAddr}
                    onChange={(e) => setShippingAddr(e.target.value)}
                    placeholder="House / Flat No., Street, Landmark"
                    className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111]"
                  />
                </div>
              </div>

              {/* Payment Method: COD vs Zero-Fee Direct UPI */}
              <div className="space-y-2.5 pt-2 border-t border-neutral-200">
                <p className="text-xs font-bold uppercase tracking-wider text-[#111111]">
                  Payment Method
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('COD')}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      paymentMethod === 'COD'
                        ? 'bg-orange-50 border-[#e0531f] text-[#111111]'
                        : 'bg-white border-neutral-200 text-neutral-600'
                    }`}
                  >
                    <span className="block text-xs font-bold uppercase">Cash on Delivery</span>
                    <span className="block text-[11px] text-neutral-500 mt-0.5">
                      Pay on doorstep arrival
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('UPI_DIRECT')}
                    className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                      paymentMethod === 'UPI_DIRECT'
                        ? 'bg-orange-50 border-[#e0531f] text-[#111111]'
                        : 'bg-white border-neutral-200 text-neutral-600'
                    }`}
                  >
                    <span className="block text-xs font-bold uppercase">Direct UPI (0% Fee)</span>
                    <span className="block text-[11px] text-neutral-500 mt-0.5">
                      GPay · PhonePe · Paytm QR
                    </span>
                  </button>
                </div>

                {paymentMethod === 'UPI_DIRECT' && totals && (
                  <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-3.5">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="bg-white p-2.5 rounded-lg border border-neutral-200 shrink-0">
                        <QRCodeSVG value={upiUri} size={128} />
                      </div>
                      <div className="space-y-2 text-xs flex-1">
                        <p className="font-bold text-[#111111] uppercase tracking-wider">
                          Scan &amp; Pay {formatINR(totals.totalINR)}
                        </p>
                        <p className="text-neutral-600">
                          Zero gateway fee. Pay directly to{' '}
                          <strong className="text-[#111111]">{settings.upiMerchantName}</strong>
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 rounded bg-white border border-neutral-200 text-[#111111] text-[11px]">
                            {settings.upiId}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopyUpi}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-neutral-200 text-[11px] text-[#e0531f] hover:border-[#e0531f] cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedUpi ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <a
                          href={upiUri}
                          className="inline-flex items-center gap-1.5 text-[#e0531f] font-semibold hover:underline"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          Open UPI App on Mobile
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="chk-utr"
                        className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                      >
                        12-Digit UPI UTR / Reference No.
                      </label>
                      <input
                        id="chk-utr"
                        type="text"
                        required
                        maxLength={40}
                        value={upiRef}
                        onChange={(e) => setUpiRef(e.target.value)}
                        placeholder="e.g. 432198765432"
                        className="w-full px-3.5 py-2 rounded bg-white border border-neutral-300 focus:border-[#111111] focus:outline-none text-sm text-[#111111] font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              {errorMsg && <p className="text-xs text-red-600 font-medium">{errorMsg}</p>}
            </form>
          )}
        </div>

        {/* Sticky Drawer Footer Summary */}
        {items.length > 0 && step !== 'confirmed' && totals && (
          <div className="p-5 bg-neutral-50 border-t border-neutral-200 space-y-3">
            <div className="space-y-1.5 text-xs tabular-nums">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>{formatINR(totals.subtotalINR)}</span>
              </div>
              {totals.discountINR > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>VIP Discount ({totals.appliedPromoCode})</span>
                  <span>-{formatINR(totals.discountINR)}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-600">
                <span>Pan-India Shipping</span>
                <span>{totals.shippingINR === 0 ? 'FREE' : formatINR(totals.shippingINR)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#111111] pt-2 border-t border-neutral-200">
                <span>Total (INR)</span>
                <span>{formatINR(totals.totalINR)}</span>
              </div>
            </div>

            {step === 'bag' ? (
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full py-3.5 px-6 rounded bg-[#111111] hover:bg-[#e0531f] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Proceed to Checkout
              </button>
            ) : (
              <button
                type="submit"
                form="checkout-form"
                disabled={submitting}
                className="w-full py-3.5 px-6 rounded bg-[#e0531f] hover:bg-[#c84617] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                {submitting
                  ? 'Confirming Order...'
                  : paymentMethod === 'UPI_DIRECT'
                  ? `Submit UPI Order · ${formatINR(totals.totalINR)}`
                  : `Place COD Order · ${formatINR(totals.totalINR)}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
