import React, { useState } from 'react';
import { PackageCheck, Search, Truck, X } from 'lucide-react';
import { lookupOrderTracking } from '../lib/api';
import type { OrderTracking } from '../types/store';
import {
  formatINR,
  getOrderStatusLabel,
  getOrderTimelineStep,
  normalizeTrackingToken,
} from '../utils/commerce';

interface TrackOrderModalProps {
  open: boolean;
  initialOrderNumber?: string;
  initialTrackingToken?: string;
  onClose: () => void;
}

const TIMELINE_STEPS = [
  { step: 1, label: 'Order Placed' },
  { step: 2, label: 'Confirmed' },
  { step: 3, label: 'Packed' },
  { step: 4, label: 'Dispatched' },
];

export const TrackOrderModal: React.FC<TrackOrderModalProps> = ({
  open,
  initialOrderNumber = '',
  initialTrackingToken = '',
  onClose,
}) => {
  const [orderNumber, setOrderNumber] = useState(initialOrderNumber);
  const [trackingToken, setTrackingToken] = useState(initialTrackingToken);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<OrderTracking | null>(null);

  React.useEffect(() => {
    if (initialOrderNumber) {
      setOrderNumber(initialOrderNumber);
    }
    if (initialTrackingToken) {
      setTrackingToken(initialTrackingToken);
    }
  }, [initialOrderNumber, initialTrackingToken]);

  if (!open) return null;

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setResult(null);

    const cleanOrder = orderNumber.trim().toUpperCase();
    const normalizedKey = normalizeTrackingToken(trackingToken);

    if (!/^SC-IN-[A-Z0-9]{6,12}$/.test(cleanOrder)) {
      setErrorMsg('Enter your Order ID (e.g. SC-IN-XXXXXXXXXX) and Tracking Key.');
      return;
    }
    if (normalizedKey.length < 8) {
      setErrorMsg('Enter your Tracking Key (e.g. XXXX-XXXX-XXXX) from your order receipt.');
      return;
    }

    setLoading(true);
    try {
      const tracking = await lookupOrderTracking(cleanOrder, trackingToken.trim().toUpperCase());
      if (!tracking) {
        setErrorMsg('Order ID or tracking key is invalid.');
      } else {
        setResult(tracking);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to track order right now.');
    } finally {
      setLoading(false);
    }
  };

  const currentStep = result ? getOrderTimelineStep(result.paymentStatus) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Track your Saucy Culture order"
    >
      <div className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl my-auto text-[#111111]">
        <div className="px-5 py-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#e0531f]" />
            <h2 className="font-display text-2xl uppercase text-[#111111]">Track Your Order</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close track order modal"
            className="p-1.5 rounded hover:bg-neutral-200 text-neutral-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <form onSubmit={handleLookup} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="track-order-id"
                  className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                >
                  Order ID
                </label>
                <input
                  id="track-order-id"
                  type="text"
                  required
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                  placeholder="SC-IN-7K9P2M4Q8X"
                  className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111] font-mono uppercase"
                />
              </div>

              <div>
                <label
                  htmlFor="track-token-key"
                  className="block text-xs font-bold uppercase tracking-wider text-neutral-700 mb-1"
                >
                  Tracking Key
                </label>
                <input
                  id="track-token-key"
                  type="text"
                  required
                  maxLength={24}
                  value={trackingToken}
                  onChange={(e) => setTrackingToken(e.target.value.toUpperCase())}
                  placeholder="ABCD-EFGH-JKLM"
                  className="w-full px-3.5 py-2.5 rounded bg-neutral-50 border border-neutral-300 focus:border-[#111111] focus:bg-white focus:outline-none text-sm text-[#111111] font-mono uppercase"
                />
              </div>
            </div>

            {errorMsg && <p className="text-xs text-red-600 font-medium">{errorMsg}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-5 rounded bg-[#111111] hover:bg-[#e0531f] disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Checking Dispatch...' : 'Check Live Status'}
            </button>
          </form>

          {result && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-neutral-500">
                    {result.customerFirstName} · {result.city}
                  </p>
                  <h3 className="font-display text-2xl text-[#111111] mt-0.5">
                    {result.orderNumber}
                  </h3>
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#e0531f] text-right">
                  {getOrderStatusLabel(result.paymentStatus)}
                </span>
              </div>

              {result.paymentStatus === 'CANCELLED' ? (
                <p className="text-xs text-red-600 font-semibold">
                  This order was cancelled. Contact support if you need assistance.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2 pt-2">
                  {TIMELINE_STEPS.map((st) => {
                    const done = currentStep >= st.step;
                    return (
                      <div key={st.step} className="space-y-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            done ? 'bg-[#e0531f]' : 'bg-neutral-200'
                          }`}
                        />
                        <p
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            done ? 'text-[#111111]' : 'text-neutral-400'
                          }`}
                        >
                          {st.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {(result.courierName || result.trackingId) && (
                <div className="bg-white border border-neutral-200 rounded p-3 text-xs flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-neutral-600">
                    <PackageCheck className="w-4 h-4 text-[#e0531f]" />
                    {result.courierName || 'Courier Assigned'}
                  </span>
                  <span className="font-mono font-bold text-[#111111]">
                    {result.trackingId || 'Pending AWB'}
                  </span>
                </div>
              )}

              <div className="border-t border-neutral-200 pt-3 space-y-1.5 text-xs">
                {result.itemsSummary.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-neutral-700 tabular-nums">
                    <span>
                      {item.name} ({item.size} × {item.qty})
                    </span>
                    <span>{formatINR(item.priceINR * item.qty)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-[#111111] pt-2 border-t border-neutral-200 tabular-nums">
                  <span>Total ({result.paymentMethod === 'UPI_DIRECT' ? 'UPI' : 'COD'})</span>
                  <span>{formatINR(result.totalINR)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
